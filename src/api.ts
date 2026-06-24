import type {
  ApplyResult,
  AuthStatus,
  MatchResult,
  ParsedAnimeEntry,
  ProviderId,
  SaveSelection
} from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? "Request failed");
  return json as T;
}

export function getAuthStatus(): Promise<AuthStatus> {
  return request("/api/auth/status");
}

export function parseAnimeText(text: string): Promise<{ entries: ParsedAnimeEntry[] }> {
  return request("/api/parse", {
    method: "POST",
    body: JSON.stringify({ text })
  });
}

export function matchAnimeEntries(
  provider: ProviderId,
  entries: ParsedAnimeEntry[]
): Promise<{ matches: MatchResult[] }> {
  return request("/api/match", {
    method: "POST",
    body: JSON.stringify({ provider, entries })
  });
}

export function applySelections(
  provider: ProviderId,
  selections: SaveSelection[]
): Promise<{ results: ApplyResult[] }> {
  return request("/api/apply", {
    method: "POST",
    body: JSON.stringify({ provider, selections })
  });
}

export async function disconnectProvider(provider: ProviderId): Promise<void> {
  await request(`/auth/${provider}/logout`, {
    method: "POST",
    body: JSON.stringify({})
  });
}
