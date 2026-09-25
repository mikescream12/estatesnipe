/**
 * OpenAI-compatible vision provider.
 * Auto-detects OPENAI_API_KEY (gpt-4o / gpt-4o-mini) or XAI_API_KEY (grok-2-vision).
 * Always requests structured JSON only.
 */

import type {
  VisionChatMessageContent,
  VisionProviderId,
  VisionStructuredPayload,
} from "./types";

import { readFileSync } from "fs";

/** Load OPENAI/XAI keys from box-secrets when not in process.env. Never logs secrets. */
function hydrateApiKeysFromBoxSecrets(): void {
  if (process.env.OPENAI_API_KEY?.trim() || process.env.XAI_API_KEY?.trim()) {
    return;
  }
  try {
    const raw = readFileSync("/home/box/agent-data/box-secrets.json", "utf8");
    const data = JSON.parse(raw) as {
      card?: Record<string, string>;
      OPENAI_API_KEY?: string;
      XAI_API_KEY?: string;
    };
    const openai = data.card?.OPENAI_API_KEY || data.OPENAI_API_KEY;
    const xai = data.card?.XAI_API_KEY || data.XAI_API_KEY;
    if (openai && !process.env.OPENAI_API_KEY) {
      process.env.OPENAI_API_KEY = openai;
    }
    if (xai && !process.env.XAI_API_KEY) {
      process.env.XAI_API_KEY = xai;
    }
  } catch {
    // not on agent box / file missing — fine
  }
}


export type VisionProvider = {
  id: VisionProviderId;
  model: string;
  baseUrl: string;
  apiKey: string;
  complete(args: {
    system: string;
    userContent: VisionChatMessageContent[];
    timeoutMs: number;
  }): Promise<VisionStructuredPayload>;
};

const OPENAI_BASE = "https://api.openai.com/v1";
const XAI_BASE = "https://api.x.ai/v1";

function pickModel(id: VisionProviderId): string {
  if (id === "xai") {
    return process.env.XAI_VISION_MODEL?.trim() || "grok-2-vision-1212";
  }
  return process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o";
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  // Prefer fenced ```json blocks
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("Vision response was not valid JSON");
  }
}

function normalizePayload(raw: unknown): VisionStructuredPayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("Vision JSON root must be an object");
  }
  const o = raw as Record<string, unknown>;
  const confidenceRaw = o.confidence;
  let confidence =
    typeof confidenceRaw === "number"
      ? confidenceRaw
      : typeof confidenceRaw === "string"
        ? Number(confidenceRaw)
        : NaN;
  if (!Number.isFinite(confidence)) confidence = 0;
  // Accept 0–100 scale and normalize
  if (confidence > 1 && confidence <= 100) confidence = confidence / 100;
  confidence = Math.min(1, Math.max(0, confidence));

  const labels = Array.isArray(o.labels)
    ? o.labels
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12)
    : [];

  const reason =
    typeof o.reason === "string" && o.reason.trim()
      ? o.reason.trim().slice(0, 240)
      : labels.length
        ? `Saw: ${labels.slice(0, 3).join(", ")}`
        : "No clear visual evidence";

  const matched = Boolean(o.matched) && confidence > 0;

  const itemGuess =
    typeof o.itemGuess === "string" && o.itemGuess.trim()
      ? o.itemGuess.trim().slice(0, 80)
      : undefined;
  let portable: boolean | null | undefined;
  if (typeof o.portable === "boolean") portable = o.portable;
  else if (o.portable === null) portable = null;
  const flipNotes =
    typeof o.flipNotes === "string" && o.flipNotes.trim()
      ? o.flipNotes.trim().slice(0, 160)
      : undefined;

  const parseUsd = (v: unknown): number | null | undefined => {
    if (v == null) return undefined;
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (!Number.isFinite(n) || n < 0 || n > 100_000) return null;
    return Math.round(n);
  };
  const valueEstLowUsd = parseUsd(o.valueEstLowUsd);
  const valueEstHighUsd = parseUsd(o.valueEstHighUsd);

  return {
    matched,
    confidence,
    labels,
    reason,
    itemGuess,
    portable,
    flipNotes,
    valueEstLowUsd,
    valueEstHighUsd,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Honor Retry-After when present; otherwise short exponential backoff. */
function retryWaitMs(res: Response, attempt: number): number {
  const hdr = res.headers.get("retry-after");
  if (hdr) {
    const secs = Number(hdr.trim());
    if (Number.isFinite(secs) && secs >= 0) {
      return Math.min(12_000, Math.max(500, Math.floor(secs * 1000)));
    }
  }
  return Math.min(8_000, 800 * 2 ** attempt);
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

async function chatCompletions(
  provider: Omit<VisionProvider, "complete">,
  args: {
    system: string;
    userContent: VisionChatMessageContent[];
    timeoutMs: number;
  }
): Promise<VisionStructuredPayload> {
  const body = {
    model: provider.model,
    temperature: 0.1,
    max_tokens: 500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.userContent },
    ],
  };

  const maxAttempts = 3;
  let lastError = "Vision API failed";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res: Response;
    let text: string;
    try {
      res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(args.timeoutMs),
        cache: "no-store",
      });
      text = await res.text();
    } catch (err) {
      lastError = err instanceof Error ? err.message : "vision_fetch_failed";
      if (attempt === maxAttempts - 1) throw new Error(lastError);
      await sleep(800 * 2 ** attempt);
      continue;
    }

    if (res.ok) {
      return finishChat(text);
    }

    lastError = `Vision API HTTP ${res.status}: ${text.slice(0, 180)}`;
    if (!RETRYABLE_STATUS.has(res.status) || attempt === maxAttempts - 1) {
      throw new Error(lastError);
    }
    await sleep(retryWaitMs(res, attempt));
  }

  throw new Error(lastError);
}

function finishChat(text: string): VisionStructuredPayload {

  let parsed: {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new Error("Vision API returned non-JSON envelope");
  }

  const content = parsed.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Vision API returned empty content");
  }

  return normalizePayload(extractJsonObject(content));
}

/**
 * Prefer OpenAI if OPENAI_API_KEY is set; else xAI if XAI_API_KEY is set.
 * Returns null when neither key exists (pipeline skips live calls).
 */
export function detectVisionProvider(): VisionProvider | null {
  hydrateApiKeysFromBoxSecrets();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const xaiKey = process.env.XAI_API_KEY?.trim();

  // Prefer OpenAI when both present (more predictable JSON mode for gpt-4o)
  if (openaiKey) {
    const id: VisionProviderId = "openai";
    const base: Omit<VisionProvider, "complete"> = {
      id,
      model: pickModel(id),
      baseUrl: process.env.OPENAI_BASE_URL?.trim() || OPENAI_BASE,
      apiKey: openaiKey,
    };
    return {
      ...base,
      complete: (args) => chatCompletions(base, args),
    };
  }

  if (xaiKey) {
    const id: VisionProviderId = "xai";
    const base: Omit<VisionProvider, "complete"> = {
      id,
      model: pickModel(id),
      baseUrl: process.env.XAI_BASE_URL?.trim() || XAI_BASE,
      apiKey: xaiKey,
    };
    return {
      ...base,
      complete: (args) => chatCompletions(base, args),
    };
  }

  return null;
}

export function hasVisionApiKey(): boolean {
  hydrateApiKeysFromBoxSecrets();
  return Boolean(
    process.env.OPENAI_API_KEY?.trim() || process.env.XAI_API_KEY?.trim()
  );
}
