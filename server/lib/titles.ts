import type { AnimeCandidate, RankedCandidate, TitleLanguage, TitleVariant } from "../types.js";
import { normalizeTitle, similarity } from "./text.js";

const LANGUAGE_LABELS: Record<TitleLanguage, string> = {
  primary: "Primary",
  english: "English",
  japanese: "Japanese",
  romaji: "Romaji",
  native: "Native",
  synonym: "Synonym"
};

export function titleVariant(
  title: string | null | undefined,
  language: TitleLanguage
): TitleVariant | null {
  const trimmed = title?.trim();
  if (!trimmed) return null;
  return { title: trimmed, language, label: LANGUAGE_LABELS[language] };
}

export function uniqueTitleVariants(variants: Array<TitleVariant | null>): TitleVariant[] {
  const seen = new Set<string>();
  const unique: TitleVariant[] = [];

  for (const variant of variants) {
    if (!variant) continue;
    const key = variant.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(variant);
  }

  return unique;
}

export function rankCandidate(
  queryTitle: string,
  candidate: AnimeCandidate,
  yearBonus: number
): RankedCandidate {
  let bestVariant = candidate.titleVariants[0] ?? {
    title: candidate.title,
    language: "primary" as const,
    label: LANGUAGE_LABELS.primary
  };
  let bestScore = similarity(queryTitle, bestVariant.title);

  for (const variant of candidate.titleVariants) {
    const score = similarity(queryTitle, variant.title);
    if (score > bestScore) {
      bestScore = score;
      bestVariant = variant;
    }
  }

  const exactTitle = candidate.titleVariants.some(
    (variant) =>
      queryTitle.trim() === variant.title.trim() ||
      (normalizeTitle(queryTitle) !== "" &&
        normalizeTitle(queryTitle) === normalizeTitle(variant.title))
  );

  const matchScore = Math.min(1, bestScore + (exactTitle ? 0.18 : 0) + yearBonus);

  return {
    ...candidate,
    matchScore,
    matchedTitle: bestVariant.title,
    matchedLanguage: bestVariant.language,
    matchedLabel: bestVariant.label
  };
}
