import type { AnimeCandidate, MatchResult, ParsedAnimeEntry, Provider } from "../types.js";
import { normalizeTitle, similarity } from "../lib/text.js";

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
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(entry, candidate)
    }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const selected = top && top.score >= 0.54 ? top.candidate : undefined;

  return {
    entry,
    selected,
    confidence: top?.score ?? 0,
    candidates: scored.map((item) => item.candidate),
    reason: selected
      ? `Matched "${entry.title}" to "${selected.title}".`
      : `No confident match for "${entry.title}".`
  };
}

function searchQuery(entry: ParsedAnimeEntry): string {
  return entry.title;
}

function scoreCandidate(entry: ParsedAnimeEntry, candidate: AnimeCandidate): number {
  const titleScore = Math.max(
    similarity(entry.title, candidate.title),
    ...candidate.synonyms.map((synonym) => similarity(entry.title, synonym))
  );

  const exactTitle =
    normalizeTitle(entry.title) === normalizeTitle(candidate.title) ||
    candidate.synonyms.some(
      (synonym) => normalizeTitle(entry.title) === normalizeTitle(synonym)
    );

  const yearBonus =
    entry.year && candidate.year
      ? Math.max(0, 0.14 - Math.abs(entry.year - candidate.year) * 0.04)
      : 0;

  return Math.min(1, titleScore + (exactTitle ? 0.18 : 0) + yearBonus);
}
