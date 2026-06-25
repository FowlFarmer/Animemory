import { readJson } from "../lib/http.js";
import type { AnimeCandidate, ExistingListEntry, Provider, SaveSelection } from "../types.js";
import { titleVariant, uniqueTitleVariants } from "../lib/titles.js";
import { fromAniListStatus, toAniListStatus } from "./status.js";

type AniListGraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string; status?: number }>;
};

type AniListSearchData = {
  Page: {
    media: Array<{
      id: number;
      idMal?: number | null;
      title: { romaji?: string; english?: string | null; native?: string | null; userPreferred?: string };
      synonyms?: string[];
      startDate?: { year?: number | null };
      episodes?: number | null;
      coverImage?: { large?: string | null };
      siteUrl?: string | null;
    }>;
  };
};

type AniListViewerData = {
  Viewer: { id: number };
};

type AniListMediaListData = {
  MediaListCollection: {
    lists: Array<{
      entries: Array<{
        mediaId: number;
        status?: string | null;
        progress?: number | null;
        score?: number | null;
      }>;
    }>;
  };
};

export const anilistProvider: Provider = {
  id: "anilist",
  label: "AniList",
  async searchAnime(query: string, token?: string): Promise<AnimeCandidate[]> {
    const data = await anilistRequest<AniListSearchData>(
      `query SearchAnime($search: String) {
        Page(page: 1, perPage: 8) {
          media(search: $search, type: ANIME) {
            id
            idMal
            title { romaji english native userPreferred }
            synonyms
            startDate { year }
            episodes
            coverImage { large }
            siteUrl
          }
        }
      }`,
      { search: query },
      token
    );

    return data.Page.media.map((media) => {
      const displayTitle =
        media.title.userPreferred ?? media.title.romaji ?? media.title.english ?? "Untitled";
      const titleVariants = uniqueTitleVariants([
        titleVariant(displayTitle, "primary"),
        titleVariant(media.title.romaji, "romaji"),
        titleVariant(media.title.english, "english"),
        titleVariant(media.title.native, "native"),
        ...(media.synonyms ?? []).map((synonym) => titleVariant(synonym, "synonym"))
      ]);
      const synonyms = titleVariants
        .filter((variant) => variant.language !== "primary")
        .map((variant) => variant.title);

      return {
        providerId: media.id,
        anilistId: media.id,
        malId: media.idMal ?? null,
        title: displayTitle,
        synonyms,
        titleVariants,
        year: media.startDate?.year ?? null,
        episodes: media.episodes ?? null,
        image: media.coverImage?.large ?? null,
        siteUrl: media.siteUrl ?? null
      } satisfies AnimeCandidate;
    });
  },
  async getAnimeListEntries(providerAnimeIds: number[], token: string): Promise<ExistingListEntry[]> {
    const wanted = new Set(providerAnimeIds);
    if (wanted.size === 0) return [];

    const viewer = await anilistRequest<AniListViewerData>(
      "query ViewerId { Viewer { id } }",
      {},
      token
    );

    const data = await anilistRequest<AniListMediaListData>(
      `query ExistingAnimeList($userId: Int) {
        MediaListCollection(type: ANIME, userId: $userId) {
          lists {
            entries {
              mediaId
              status
              progress
              score
            }
          }
        }
      }`,
      { userId: viewer.Viewer.id },
      token
    );

    return data.MediaListCollection.lists
      .flatMap((list) => list.entries)
      .filter((entry) => wanted.has(entry.mediaId))
      .map((entry) => ({
        providerAnimeId: entry.mediaId,
        status: fromAniListStatus(entry.status ?? undefined),
        progress: entry.progress ?? undefined,
        score: entry.score ?? undefined
      }));
  },
  async saveAnimeEntry(selection: SaveSelection, token: string): Promise<unknown> {
    return anilistRequest(
      `mutation SaveAnimeEntry(
        $mediaId: Int
        $status: MediaListStatus
        $progress: Int
        $score: Float
        $notes: String
      ) {
        SaveMediaListEntry(
          mediaId: $mediaId
          status: $status
          progress: $progress
          score: $score
          notes: $notes
        ) {
          id
          mediaId
          status
          progress
          score
        }
      }`,
      {
        mediaId: selection.providerAnimeId,
        status: toAniListStatus(selection.status),
        progress: selection.progress,
        score: selection.score,
        notes: selection.notes
      },
      token
    );
  }
};

async function anilistRequest<T>(
  query: string,
  variables: Record<string, unknown>,
  token?: string
): Promise<T> {
  const response = await readJson<AniListGraphqlResponse<T>>(
    await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ query, variables })
    })
  );

  if (response.errors?.length) {
    throw new Error(response.errors.map((error) => error.message).join("; "));
  }

  if (!response.data) throw new Error("AniList returned no data.");
  return response.data;
}
