# Animemory Agent Notes

## Project Purpose

Animemory is a web app for importing messy, pasted anime lists into a user's MyAnimeList or AniList account. The important product constraint is that list writes must be reviewed by the user before they happen. LLMs can help parse text, but they should not directly choose and mutate provider entries without a review step.

## Current Stack

- React + Vite client in `src/`.
- Express API server in `server/`.
- Provider adapters live in `server/providers/`.
- Parsing and matching services live in `server/services/`.
- Shared server types live in `server/types.ts`.
- Client-side API/types live in `src/api.ts` and `src/types.ts`.

## Development Commands

```bash
npm install
npm run dev
npm run build
```

`npm run dev` starts:

- Vite client at `http://127.0.0.1:5173`
- Express API at `http://127.0.0.1:8787`

Run `npm run build` before handing off meaningful code changes. It performs TypeScript checking and a production Vite build.

## Environment

Copy `.env.example` to `.env`.

OAuth callback URLs for local development:

```txt
MyAnimeList: http://127.0.0.1:8787/api/auth/mal/callback
AniList:     http://127.0.0.1:8787/api/auth/anilist/callback
```

`GEMINI_API_KEY` is optional. Without it, the app uses deterministic parsing.

## Implementation Guidelines

- Keep MAL and AniList behavior behind the `Provider` interface in `server/types.ts`.
- Normalize app-level statuses first, then map to provider-specific values in `server/providers/status.ts`.
- Avoid provider-specific logic in React components.
- Keep `/api/parse`, `/api/match`, and `/api/apply` as separate steps.
- Never apply entries that the browser UI has not selected.
- Prefer title-only provider search plus local candidate ranking. Years should influence ranking rather than being appended to every search query.
- Treat provider IDs as provider-scoped. Store `malId` and `anilistId` separately when both are available.
- Add rate-limit handling before increasing batch sizes or automatic retries.

## LLM Guidance

Use the LLM for extraction and disambiguation hints, not as the sole source of truth. The preferred flow is:

1. Extract structured entries from messy text.
2. Search the selected provider's real catalog.
3. Rank candidates deterministically.
4. Let the user review and override matches.
5. Write only selected entries.

The Gemini parser uses structured JSON output. When changing its prompt or schema, preserve the JSON contract expected by `server/services/parser.ts`.

## Auth And Tokens

OAuth state and provider tokens are stored in separate AES-256-GCM encrypted HTTP-only cookies. Browser JavaScript cannot read them.

- Production requires a stable 32-byte base64 `SESSION_ENCRYPTION_KEY` so all Vercel function instances can decrypt the same cookies.
- The short-lived OAuth cookie contains the state value and MAL PKCE verifier, then is cleared after the callback.
- Provider cookies carry only their own provider token payload, which keeps each encrypted cookie within browser cookie-size limits.
- Provider refresh tokens are persisted when returned. MAL refreshes automatically just before expiry; confirm AniList refresh behavior before adding a corresponding flow.

Do not log access tokens, OAuth codes, refresh tokens, or raw provider authorization headers.

## Testing Notes

The project currently has no dedicated test runner. Verification should include:

- `npm run build`
- Browser smoke test of parsing and matching
- Authenticated write test only when valid provider OAuth credentials are available
- Vercel production OAuth smoke test with `SESSION_ENCRYPTION_KEY` configured

For browser smoke tests, use AniList search first because unauthenticated catalog search works without OAuth.
