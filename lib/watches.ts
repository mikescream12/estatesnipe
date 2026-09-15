export type Watch = {
  id: string;
  keyword: string;
  zip: string;
  radiusMi: number;
  excludeAuctions?: boolean;
  notes?: string[];
  createdAt: string;
};

const STORAGE_KEY = "estatesnipe.watches.v1";
const PROFILE_KEY = "estatesnipe.profile.v1";

export type Profile = {
  phone: string;
  email: string;
  zip: string;
  radiusMi: number;
  consentAlerts: boolean;
  consentMarketing: boolean;
};

export function loadWatches(): Watch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Watch[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveWatches(watches: Watch[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(watches));
}

export function addWatch(input: Omit<Watch, "id" | "createdAt">): Watch[] {
  const next: Watch = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const list = loadWatches();
  const updated = [next, ...list];
  saveWatches(updated);
  return updated;
}

export function addWatches(inputs: Omit<Watch, "id" | "createdAt">[]): Watch[] {
  let list = loadWatches();
  const stamped = inputs.map((input) => ({
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }));
  list = [...stamped, ...list];
  saveWatches(list);
  return list;
}

export function deleteWatch(id: string): Watch[] {
  const updated = loadWatches().filter((w) => w.id !== id);
  saveWatches(updated);
  return updated;
}

export function loadProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile: Profile): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}
