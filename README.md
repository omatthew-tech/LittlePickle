# LittlePickle

LittlePickle is an iOS-first React Native app starter built from the approved light-mode mobile design system. iOS and Android are developed together, with Android used as the primary PC emulator preview target when a Mac is not available.

This project targets Expo SDK 54 for Expo Go compatibility on physical iPhones and Android emulator/device previews.

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
   The create-league flow uses Supabase email OTP, so configure Auth email delivery and make sure the Magic Link email template includes the `{{ .Token }}` variable for the code users enter in the app.

3. Start the app:

   ```sh
   npm run dev:lan
   ```

   On a physical iPhone, install Expo Go from the App Store and scan the QR code shown in the terminal.
   On this PC, start an Android emulator and run:

   ```sh
   npm run android
   ```

   For live API calls from Expo Go on a physical phone, run the backend with `--host 0.0.0.0` and set `EXPO_PUBLIC_MATCH_FLOW_API_URL` to your computer's LAN IP, for example `http://192.168.4.21:8000`. Use `EXPO_PUBLIC_ANDROID_EMULATOR_MATCH_FLOW_API_URL=http://10.0.2.2:8000` for the Android emulator on this PC. Use `http://127.0.0.1:8000` only for iOS simulator or desktop preview.
   If an Android build still shows an old `EXPO_PUBLIC_MATCH_FLOW_API_URL` after editing `.env`, stop Expo and restart with `npm run android:emulator`.

   If your phone cannot connect over LAN, use:

   ```sh
   npm run dev:tunnel
   ```

   `npm run ios` is only for macOS machines with Xcode installed because it opens the iOS Simulator. `npm run android` is the normal PC emulator preview path.

   If Expo Go says the project is incompatible, close the Expo dev server, run `npm install`, then restart with `npm run dev:clear`. The app should report SDK 54 in Expo CLI output.

## App scope

- iOS remains the product and visual priority; Android is developed in parallel and should stay functional, readable, and close to the iOS-first design.
- Android screenshots are valid QA input for layout, permissions, keyboard behavior, camera scanning, image picking, and media saving.
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
- FastAPI returns one coordinated, disjoint recommendation per usable open court, capped by the available player count.
- Players who sat out the previous opportunity are guaranteed a place in the next batch whenever court capacity allows; the remaining selection uses a 60% court-time fairness and 40% match-balance objective.
- Every completed match permanently updates `players.rating` with a team Elo adjustment. Even matches move each player by `0.10`; expected wins move less and upsets move more, so future sessions retain the evidence from prior results.

Auth behavior:

- If Supabase env vars are missing, the app stays in local demo mode.
- If Supabase env vars are present, the app still opens on Home; live organization actions require a signed-in Supabase session.
- Guest queue entry uses Supabase anonymous sign-ins so players can join without entering email. Enable Anonymous sign-ins in Supabase Auth before testing join queue.
- Profile image upload helpers live in `src/lib/profileImages.ts`.

Shared play ownership is intentional. Players are never claimed by or linked to a device, so any number of devices may join as and manage the same player. This supports players who leave their phones off-court and rely on others to manage the queue and matches for them.

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
setOrganizationScoreMode(...)
setOrganizationMemberRole(...)
createPlayer(...)
updateOrganizationPlayer(...)
createPlaySession(...)
getOrganizationOpenSessions(...)
addPlayerToSession(...)
removePlayerFromSession(...)
getSessionPlayerOptions(...)
getActiveRecommendations(...)
getActiveMatches(...)
getCompletedMatches(...)
updateCompletedMatchResult(...)
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
- From Home, users can scan a league QR, search existing leagues, create a league, or view a league without joining. Viewing alone never changes membership; Join queue, Add, and Remove are explicit actions, and empty queues retain the full editable league roster.
- Organization admins can update name, slug, court count, member roles, and roster players from Home.
- Players are shared league records rather than auth-user-owned records; any device may select and manage the same player.
- Profile edits and user switching update the locally selected shared player and flow through to queue and match cards.
- Delete profile asks which league to leave. Leaving removes that membership and hides the player from active league views while retaining the league-specific rating and match history for a later rejoin.
- Delete account leaves every league, clears locally saved league/player state, and returns the app to its initial Home experience before the existing 30-day account-deletion retention completes.
- If there are no active recommendations and `EXPO_PUBLIC_MATCH_FLOW_API_URL` is set, Play asks FastAPI to regenerate and store recommendations against a versioned queue snapshot.
- Starting a recommended match assigns the lowest open court, creates an active match, then refreshes active matches and recommendations only when another court is open.
- Recommendations containing a player who has left the queue or is already in an active match are hidden. If no valid recommendations remain while a court is open, Play regenerates recommendations from the available players.
- When every court is active, recommendation start buttons are disabled until a score is reported.
- Reporting an active match result completes that match, permanently updates all four player ratings, advances the queue, and regenerates recommendations. Each league can require either a final score or a selected winning team.
- Match history reads append-only results from Supabase. Scored results retain their numbers across league mode changes, while winner-only results remain Win/Loss records.
- Adding/removing a current player or changing a rating invalidates the old batch and refreshes recommendations.
- A play session closes automatically when its last active player leaves the queue, invalidates its recommendations, and returns the app from Play to Home.
- Supabase Cron closes every remaining open session daily at 4:00 AM America/New_York; any match still active at that cutoff is cancelled.
- Deactivated players disappear from active app views immediately and can be restored by a league admin for 30 days. Supabase Cron then anonymizes their profile and rating data, while the FastAPI service removes queued profile images from Supabase Storage.
- The camera QR scanner resolves LittlePickle league QR values and opens the join queue.

The Supabase migrations live at:

```sh
supabase/migrations/
```

Apply every migration in timestamp order when setting up a live project.

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
SMTP2GO_API_KEY=your-smtp2go-api-key
EMAIL_FROM=support@joinlittlepickle.com
EMAIL_SENDER_NAME=LittlePickle
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=your-smtp-username
SMTP_PASSWORD=your-smtp-password
SMTP_SENDER=no-reply@example.com
SMTP_USE_TLS=true
```

Never put the service role key in the Expo app.
`SMTP2GO_API_KEY` is used to send newly created league QR codes to league admins. The `SMTP_*` settings are an optional fallback if you prefer direct SMTP.

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
