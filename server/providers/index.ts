import type { Provider, ProviderId } from "../types.js";
import { anilistProvider } from "./anilist.js";
import { malProvider } from "./mal.js";

export const providers: Record<ProviderId, Provider> = {
  mal: malProvider,
  anilist: anilistProvider
};

export function getProvider(providerId: ProviderId): Provider {
  return providers[providerId];
}
