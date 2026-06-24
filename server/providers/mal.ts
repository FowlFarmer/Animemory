import { config } from "../config.js";
import { readJson } from "../lib/http.js";
import type { AnimeCandidate, Provider, SaveSelection } from "../types.js";
import { titleVariant, uniqueTitleVariants } from "../lib/titles.js";
import { toMalStatus } from "./status.js";

type MalSearchResponse = {
  data: Array<{
    node: {
      id: number;
      title: string;
      main_picture?: { medium?: string; large?: string };
      alternative_titles?: { synonyms?: string[]; en?: string; ja?: string };
      start_date?: string;
      num_episodes?: number;
    };
  }>;
};

export const malProvider: Provider = {
  id: "mal",
  label: "MyAnimeList",
  async searchAnime(query: string, token?: string): Promise<AnimeCandidate[]> {
    const url = new URL("https://api.myanimelist.net/v2/anime");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "8");
    url.searchParams.set(
      "fields",
      "id,title,main_picture,alternative_titles,start_date,num_episodes"
    );

    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (config.mal.clientId) headers["X-MAL-CLIENT-ID"] = config.mal.clientId;

    const json = await readJson<MalSearchResponse>(await fetch(url, { headers }));

    return json.data.map(({ node }) => {
      const titleVariants = uniqueTitleVariants([
        titleVariant(node.title, "primary"),
        titleVariant(node.alternative_titles?.en, "english"),
        titleVariant(node.alternative_titles?.ja, "japanese"),
        ...(node.alternative_titles?.synonyms ?? []).map((synonym) =>
          titleVariant(synonym, "synonym")
        )
      ]);
      const synonyms = titleVariants
        .filter((variant) => variant.language !== "primary")
        .map((variant) => variant.title);

      return {
        providerId: node.id,
        malId: node.id,
        anilistId: null,
        title: node.title,
        synonyms,
        titleVariants,
        year: node.start_date ? Number(node.start_date.slice(0, 4)) : null,
        episodes: node.num_episodes ?? null,
        image: node.main_picture?.large ?? node.main_picture?.medium ?? null,
        siteUrl: `https://myanimelist.net/anime/${node.id}`
      } satisfies AnimeCandidate;
    });
  },
  async saveAnimeEntry(selection: SaveSelection, token: string): Promise<unknown> {
    const url = `https://api.myanimelist.net/v2/anime/${selection.providerAnimeId}/my_list_status`;
    const body = new URLSearchParams();
    const status = toMalStatus(selection.status);

    if (status) body.set("status", status);
    if (selection.status === "repeating") body.set("is_rewatching", "true");
    if (selection.score !== undefined) body.set("score", String(Math.round(selection.score)));
    if (selection.progress !== undefined) {
      body.set("num_watched_episodes", String(selection.progress));
    }
    if (selection.notes) body.set("comments", selection.notes);

    return readJson(
      await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body
      })
    );
  }
};
