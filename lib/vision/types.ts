/**
 * Vision photo-matching types for EstateSnipe premium matching.
 * Confidence is 0–1. Prefer false negatives over false positives (esp. MCM).
 */

export type VisionMatchRequest = {
  /** Watch / hunt intent text (e.g. "MCM furniture", "sealed pokemon") */
  intent: string;
  /** Expanded keywords / synonyms used for text matching */
  keywords: string[];
  /** Optional category hints (e.g. furniture, trading cards) */
  categories?: string[];
  /** Listing photo URLs (full-size preferred) */
  photoUrls: string[];
  /** Listing title for context only — never sole evidence of a match */
  listingTitle?: string;
  /** Listing id for logging / cache correlation */
  listingId?: string;
};

export type VisionMatchResult = {
  /** True only when model says match AND confidence >= threshold */
  matched: boolean;
  /** Model confidence 0–1 */
  confidence: number;
  /** Short visual labels the model saw that support (or refute) the match */
  labels: string[];
  /** One-line human reason suitable for UI badge subtitle */
  reason: string;
  /** Photo URLs actually sent to the model */
  photoUrlsUsed: string[];
  /** Provider that produced the result */
  provider?: "openai" | "xai" | "none";
  /** Model id used */
  model?: string;
  /** True when result came from cache */
  cached?: boolean;
  /** Soft error / skip reason (no throw) */
  error?: string;
};

export type MatchSource = "text" | "photo" | "both";

export type VisionProviderId = "openai" | "xai";

export type VisionChatMessageContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

export type VisionStructuredPayload = {
  matched: boolean;
  confidence: number;
  labels: string[];
  reason: string;
};
