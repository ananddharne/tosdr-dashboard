# ToS;DR Dashboard

Expo (React Native + web) app showing ToS;DR privacy grades for the apps you use, plus a
Node server for chat and "Direct check" (grading apps ToS;DR hasn't reviewed). **This repo
is public**: never commit keys, `.env`, or personal details.

## Layout
- `App.tsx`: navigation stack; web header back button.
- `src/screens/`: one file per screen. `DirectCheckScreen` is the main flow.
- `src/state/store.tsx`: app state; runs direct checks in the background (`startDirectCheck`).
- `src/api/directCheck.ts`: calls the server, with a quote-only fallback. `src/api/tosdr.ts`: ToS;DR API.
- `src/theme/index.ts`: all colors (light/dark palettes) and type; `useTheme`, `useAppearance`.
- `src/components/ui.tsx`: shared UI (Button, ServiceRow, GradeBadge, ThemeToggle…).
- `server/src/`: `server.ts` (HTTP routes), `policyPages.ts` (finds and reads policy pages, headless
  Chrome fallback), `caseRating.ts` (model matches ToS;DR cases, then ToS;DR's grade formula),
  `modelApi.ts` (provider client), `checkCache.ts` (7-day per-site cache in memory).

## Commands
- Typecheck: `npx tsc --noEmit` (app) and `cd server && npx tsc --noEmit` (server). No test suite.
- Local server: `cd server && npm run build && npm start` (port 3001; reads `server/.env`).
- Local web: `EXPO_PUBLIC_CHAT_API_URL=http://localhost:3001 npx expo start --web`
  (served at `/tosdr-dashboard/`).
- Publish web: `npm run deploy:web` (builds with the Render URL, pushes the `gh-pages` branch).

## Deploy
- Web: GitHub Pages at ananddharne.github.io/tosdr-dashboard, published only by `npm run deploy:web`.
  The server URL is baked in at build time.
- Server: Render (`render.yaml`, Docker) at tosdr-dashboard-server.onrender.com; redeploys
  automatically on push to `master`. Check with `GET /health`.
- Ask before pushing or publishing; both are live for testers.

## Model and costs
- Gemini via its OpenAI-compatible endpoint, on a paid key. Settings: `MODEL_PROVIDER`
  (gemini|meta), `MODEL_NAME` (default `gemini-3.8-flash`, falls back to 3.6 Flash),
  `RATING_MAX_POLICY_CHARS` (default 400k: full text; cutting it made grades worse).
- One graded check ≈ 6 model calls ≈ $0.07–0.25. Test page reading with `"rate": false` (free)
  before running anything graded, and get the user's OK before paid test runs.
- Accuracy: usually within one letter of ToS;DR's grade, rarely exact. Most bad grades come from
  reading the wrong pages, not from the model.

## Rules
- Keys live only in `server/.env` (gitignored) or Render's environment, never in `.env.example`.
  Before committing, scan the staged diff for keys.
- Colors come only from theme tokens; never write hex values in screens.
- Restyles: mock up options on a canvas and get the user's pick before changing the theme.
- ToS;DR attribution (CC BY-SA) must stay on the About screen.
- Direct-check findings are exact quotes verified against the page; the model never sets the
  letter. Keep results labelled "Estimated · not reviewed by ToS;DR".
