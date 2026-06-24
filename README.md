# Animemory

Animemory is a web app for turning a stray text list of anime into reviewed, bulk-added entries on MyAnimeList or AniList.

## What It Does

- Accepts messy pasted text like `Cowboy Bebop completed 10/10`.
- Extracts title, year, status, score, progress, and notes.
- Searches the selected provider for real anime entries.
- Scores candidate matches by title similarity, aliases, and year.
- Lets the user review and override every match before anything is written.
- Adds selected entries to the connected user's list.

The parser can use Gemini 3.1 Flash Lite when enabled, but **Gemini is disabled by default** (`GEMINI_DISABLED=true`) while the deterministic fallback parser is being tested. Set `GEMINI_DISABLED=false` and provide `GEMINI_API_KEY` to turn Gemini parsing back on. In both modes, the app still searches the provider catalog and asks the user to review matches before writing anything.

## Stack

- Vite + React for the browser app.
- Express for the local API and OAuth callbacks.
- Provider adapters for MyAnimeList and AniList.
- Optional Gemini 3.1 Flash Lite call for messy text extraction.

## Project Layout

```txt
src/
  App.tsx          Browser workflow for paste, match, review, and apply
  api.ts           Client API wrapper
  types.ts         Client-side shared types
  styles.css       App styling

server/
  app.ts           Express app shared by local development and Vercel
  index.ts         Local development server entrypoint
  auth.ts          MAL and AniList OAuth flow
  providers/       Provider-specific search and save adapters
  services/        Parsing and matching services
  lib/             Text and HTTP helpers
  types.ts         Server-side shared types

api/
  [...path].ts     Vercel Function entrypoint for API and OAuth routes
```

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Then open:

```txt
http://127.0.0.1:5173
```

The API server runs at:

```txt
http://127.0.0.1:8787
```

To verify the app:

```bash
npm run build
```

## Environment

Create OAuth applications with these local redirect URIs:

```txt
MyAnimeList: http://127.0.0.1:8787/api/auth/mal/callback
AniList:     http://127.0.0.1:8787/api/auth/anilist/callback
```

Fill in `.env`:

```txt
GEMINI_DISABLED=true
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite

MAL_CLIENT_ID=
MAL_CLIENT_SECRET=
MAL_REDIRECT_URI=http://127.0.0.1:8787/api/auth/mal/callback

ANILIST_CLIENT_ID=
ANILIST_CLIENT_SECRET=
ANILIST_REDIRECT_URI=http://127.0.0.1:8787/api/auth/anilist/callback
```

## Deploying To Vercel

Animemory is configured for a public Vercel deployment. OAuth state and provider tokens live in HTTP-only cookies, so no database or Redis service is required.

1. Push this repository to GitHub and import it into Vercel.
2. Add these environment variables in Vercel:

```txt
APP_ORIGIN=https://your-domain.vercel.app
GEMINI_DISABLED=true
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite
MAL_CLIENT_ID=
MAL_CLIENT_SECRET=
MAL_REDIRECT_URI=https://your-domain.vercel.app/api/auth/mal/callback
ANILIST_CLIENT_ID=
ANILIST_CLIENT_SECRET=
ANILIST_REDIRECT_URI=https://your-domain.vercel.app/api/auth/anilist/callback
```

3. Register the two production callback URLs exactly as shown in the MAL and AniList application settings.
4. Deploy from Vercel.

Use a stable production domain for OAuth callbacks. Preview deployment URLs are intentionally not suitable because they change.

The public OAuth entrypoint is `https://your-domain.vercel.app/api/auth/mal/start`. OAuth functions use direct Vercel API paths so they do not depend on a rewrite rule.

## Matching Flow

1. `/api/parse` extracts normalized entries from pasted text.
2. `/api/match` searches MAL or AniList and ranks candidates.
3. The browser displays candidate selectors for manual review.
4. `/api/apply` saves only selected entries through the chosen provider adapter.

This avoids the brittle version of "LLM picks and writes directly." The LLM can help with extraction, but provider search and user review remain the source of truth.

The current matcher searches by cleaned title and uses year as a local ranking signal. That keeps searches broad enough for provider catalogs while still rewarding exact-year matches.

## Status Mapping

Animemory normalizes statuses internally:

```txt
current
planning
completed
paused
dropped
repeating
```

Provider adapters translate those into provider-specific values:

```txt
MAL:     watching, plan_to_watch, completed, on_hold, dropped
AniList: CURRENT, PLANNING, COMPLETED, PAUSED, DROPPED, REPEATING
```

## Provider Notes

MyAnimeList writes through:

```txt
PUT https://api.myanimelist.net/v2/anime/{anime_id}/my_list_status
```

AniList writes through the GraphQL mutation:

```graphql
SaveMediaListEntry(mediaId: ..., status: ...)
```

OAuth state and provider tokens are stored in separate HTTP-only, `Secure`, `SameSite=Lax` browser cookies. They are not readable by browser JavaScript.

## Current Limitations

- OAuth credentials are required before authenticated writes can be tested.
- MAL tokens refresh automatically when a refresh token is available. Confirm AniList's refresh-token behavior before adding a corresponding flow.
- Cookie payloads must remain below browser cookie-size limits; Animemory keeps OAuth and provider tokens in separate cookies for this reason.
- Batch writes are sequential and do not yet include provider-aware retry or rate-limit backoff.
- The fallback parser is intentionally simple; set `GEMINI_DISABLED=false` and configure `GEMINI_API_KEY` for better extraction from highly irregular text.
