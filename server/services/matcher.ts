import type { MatchResult, ParsedAnimeEntry, Provider } from "../types.js";
import { rankCandidate } from "../lib/titles.js";

export async function matchEntries(
  provider: Provider,
  entries: ParsedAnimeEntry[],
  token?: string
): Promise<MatchResult[]> {
  return Promise.all(entries.map((entry) => matchEntry(provider, entry, token)));
}

async function matchEntry(
  provider: Provider,
  entry: ParsedAnimeEntry,
  token?: string
): Promise<MatchResult> {
  const candidates = await provider.searchAnime(searchQuery(entry), token);
  const scored = candidates
    .map((candidate) => rankCandidate(entry.title, candidate, yearBonus(entry, candidate)))
    .sort((a, b) => b.matchScore - a.matchScore);

  const top = scored[0];
  const selected = top && top.matchScore >= 0.54 ? top : undefined;

  return {
    entry,
    selected,
    confidence: top?.matchScore ?? 0,
    candidates: scored,
    reason: selected
      ? `Matched "${entry.title}" to "${selected.matchedTitle}" (${selected.matchedLabel}).`
      : `No confident match for "${entry.title}".`
  };
}

function searchQuery(entry: ParsedAnimeEntry): string {
  return entry.title;
}

function yearBonus(entry: ParsedAnimeEntry, candidate: { year?: number | null }): number {
  return entry.year && candidate.year
    ? Math.max(0, 0.14 - Math.abs(entry.year - candidate.year) * 0.04)
    : 0;
}
