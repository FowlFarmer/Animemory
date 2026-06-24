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

export type AnimeCandidate = {
  providerId: number;
  malId?: number | null;
  anilistId?: number | null;
  title: string;
  synonyms: string[];
  year?: number | null;
  episodes?: number | null;
  image?: string | null;
  siteUrl?: string | null;
};

export type MatchResult = {
  entry: ParsedAnimeEntry;
  selected?: AnimeCandidate;
  confidence: number;
  candidates: AnimeCandidate[];
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

export type Provider = {
  id: ProviderId;
  label: string;
  searchAnime(query: string, token?: string): Promise<AnimeCandidate[]>;
  saveAnimeEntry(selection: SaveSelection, token: string): Promise<unknown>;
};
