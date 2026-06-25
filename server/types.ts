export type ProviderId = "mal" | "anilist";

export type NormalizedStatus =
  | "current"
  | "planning"
  | "completed"
  | "paused"
  | "dropped"
  | "repeating";

export type ParsedAnimeEntry = {
  id: string;
  raw: string;
  title: string;
  year?: number;
  status?: NormalizedStatus;
  score?: number;
  progress?: number;
  notes?: string;
};

export type TitleLanguage =
  | "primary"
  | "english"
  | "japanese"
  | "romaji"
  | "native"
  | "synonym";

export type TitleVariant = {
  title: string;
  language: TitleLanguage;
  label: string;
};

export type AnimeCandidate = {
  providerId: number;
  malId?: number | null;
  anilistId?: number | null;
  title: string;
  synonyms: string[];
  titleVariants: TitleVariant[];
  year?: number | null;
  episodes?: number | null;
  image?: string | null;
  siteUrl?: string | null;
};

export type RankedCandidate = AnimeCandidate & {
  matchScore: number;
  matchedTitle: string;
  matchedLanguage: TitleLanguage;
  matchedLabel: string;
};

export type MatchResult = {
  entry: ParsedAnimeEntry;
  selected?: RankedCandidate;
  confidence: number;
  candidates: RankedCandidate[];
  reason: string;
};

export type SaveSelection = {
  parsedId: string;
  providerAnimeId: number;
  status?: NormalizedStatus;
  score?: number;
  progress?: number;
  notes?: string;
};

export type ExistingListEntry = {
  providerAnimeId: number;
  status?: NormalizedStatus;
  score?: number;
  progress?: number;
};

export type Provider = {
  id: ProviderId;
  label: string;
  searchAnime(query: string, token?: string): Promise<AnimeCandidate[]>;
  getAnimeListEntries?(providerAnimeIds: number[], token: string): Promise<ExistingListEntry[]>;
  saveAnimeEntry(selection: SaveSelection, token: string): Promise<unknown>;
};
