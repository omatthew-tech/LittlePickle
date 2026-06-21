# LittlePickle

LittlePickle is an iOS-first React Native app starter built from the approved light-mode mobile design system.

This project targets Expo SDK 54 for Expo Go compatibility on physical iPhones.

## Run the app

1. Install dependencies:

   ```sh
   npm install
   ```

2. Add Supabase settings:

   ```sh
   cp .env.example .env
   ```

   Then fill in `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `EXPO_PUBLIC_MATCH_FLOW_API_URL`.

3. Start iOS:

   ```sh
   npm run dev:lan
   ```

   On a physical iPhone, install Expo Go from the App Store and scan the QR code shown in the terminal.

   For live API calls from Expo Go, run the backend with `--host 0.0.0.0` and set `EXPO_PUBLIC_MATCH_FLOW_API_URL` to your computer's LAN IP, for example `http://192.168.4.21:8000`. Use `http://127.0.0.1:8000` only for simulator or desktop preview.

   If your phone cannot connect over LAN, use:

   ```sh
   npm run dev:tunnel
   ```

   `npm run ios` is only for macOS machines with Xcode installed because it opens the iOS Simulator.

   If Expo Go says the project is incompatible, close the Expo dev server, run `npm install`, then restart with `npm run dev:clear`. The app should report SDK 54 in Expo CLI output.

## App scope

- Home follows the supplied QR/search wireframe.
- Play follows the supplied recommended match/current players wireframe.
- Profile supports signed-in user display names, profile pictures, and sign out.
- Supabase is scaffolded in `src/lib/supabase.ts` and will not initialize until the Expo public env vars are set.
- Match-flow API calls are scaffolded in `src/lib/matchFlowApi.ts` and will not initialize until `EXPO_PUBLIC_MATCH_FLOW_API_URL` is set.
- Supabase data RPC helpers are scaffolded in `src/lib/littlePickleData.ts`.

## Match flow architecture

LittlePickle uses Supabase directly for ordinary app data and a small FastAPI service for authoritative match/session commands:

- Supabase Auth signs users in.
- Supabase Postgres stores organizations, admins, players, sessions, queue state, matches, scores, pass events, and recommendation batches.
- Supabase Storage stores profile pictures in the `profile-pictures` bucket.
- FastAPI handles match completion, pass-player actions, accepting recommendations, and recommendation regeneration.
- The recommendation count is always `organization.number_of_courts + 1` when enough players are available.

Auth behavior:

- If Supabase env vars are missing, the app stays in local demo mode.
- If Supabase env vars are present, the app still opens on Home; live organization actions require a signed-in Supabase session.
- Profile image upload helpers live in `src/lib/profileImages.ts`.

Core Supabase RPC flow:

```ts
getMyOrganizations()
getMyProfile()
updateMyProfile(...)
searchOrganizations(...)
joinOrganization(...)
createOrganization(...)
getOrganizationMembersForAdmin(...)
getOrganizationPlayersForAdmin(...)
updateOrganizationSettings(...)
setOrganizationMemberRole(...)
createPlayer(...)
updateOrganizationPlayer(...)
ensureCurrentUserPlayer(...)
createPlaySession(...)
getOrganizationOpenSessions(...)
closePlaySession(...)
addPlayerToSession(...)
removePlayerFromSession(...)
getSessionPlayerOptions(...)
getActiveRecommendations(...)
getActiveMatches(...)
getCompletedMatches(...)
```

Core FastAPI command flow:

```ts
acceptRecommendation(...)
completeMatch(...)
passPlayer(...)
regenerateSessionRecommendations(...)
```

Live Play screen bridge:

- If Supabase is not configured, Play uses bundled sample data.
- If Supabase is configured, Play expects a live session selected from Home. `EXPO_PUBLIC_DEFAULT_SESSION_ID` is only a local-dev shortcut for loading one known session directly.
- From Home, users can scan a league QR, search existing leagues, create a league, and enter Play with the selected session.
- Organization admins can update name, slug, court count, member roles, and roster players from Home.
- Creating or joining an organization ensures the signed-in user has a player record for that organization.
- Profile lets signed-in users update their display name and profile picture, and both sync to player rows and match cards.
- If there are no active recommendations and `EXPO_PUBLIC_MATCH_FLOW_API_URL` is set, Play asks FastAPI to regenerate and store recommendations.
- Starting a recommended match assigns the lowest open court, creates an active match, then refreshes active matches and recommendations only when another court is open.
- When every court is active, recommendation start buttons are disabled until a score is reported.
- Reporting an active match score completes that match, advances the queue, and regenerates recommendations.
- Match history reads completed matches and saved scores from Supabase.
- Adding/removing a current player updates the session queue and refreshes recommendations.
- Ending a play session closes it, removes it from Home resume options, and requires active matches to be completed first.
- The camera QR scanner resolves LittlePickle league QR values and opens the join queue.

The first Supabase migration lives at:

```sh
supabase/migrations/202606200001_match_flow.sql
```

The FastAPI service lives in:

```sh
backend/
```

Run the backend locally:

```sh
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Backend env vars belong in `backend/.env`:

```sh
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CORS_ALLOWED_ORIGINS=*
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=your-smtp-username
SMTP_PASSWORD=your-smtp-password
SMTP_SENDER=no-reply@example.com
SMTP_USE_TLS=true
```

Never put the service role key in the Expo app.
SMTP settings are used to send newly created league QR codes to league admins.

Backend verification:

```sh
cd backend
python scripts/smoke_check.py
```

Backend deployment files:

```sh
backend/Dockerfile
render.yaml
```

For the exact live setup sequence, use `LIVE_SETUP.md`.

## Design system

- `LittlePickle_Design_System.md` - complete human-readable specification
- `visual/LittlePickle_Design_System_Reference.png` - visual reference board
- `tokens/littlepickle.tokens.json` - DTCG-style design tokens
- `contracts/littlepickle.components.json` - machine-readable component contracts
- `agents/AGENTS.md` - concise coding-agent rules
- `web/littlepickle.css` - optional web/prototype projection
- `icons/` - Rally Loop SVG icon set

The design system intentionally contains only six core components and two defined screen patterns.
