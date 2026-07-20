# LittlePickle Live Setup Checklist

Use this checklist when moving from local/demo mode to a real Supabase-backed app.

## 1. Supabase project

Create or open a Supabase project and collect:

- Project URL, for example `https://your-project.supabase.co`
- Publishable/anon key
- Service role key

Keep the service role key server-only. Never put it in Expo env vars.

Configure Auth before testing live app flows:

- Enable Anonymous sign-ins. LittlePickle uses `signInAnonymously()` for guest queue entry so players can join without entering email.
- Configure Auth email delivery before testing league creation. LittlePickle asks admins to enter an email code, so the Supabase Magic Link email template must include `{{ .Token }}` and your SMTP sender/domain must be verified with the email provider.

## 2. Database and storage

Apply every file in `supabase/migrations/` in timestamp order. These migrations create the organization, player, session, queue, recommendation, match, score, pass-event, profile, profile-picture storage, and league-join schema.

```sh
supabase/migrations/
```

## 3. Backend

Create `backend/.env`:

```sh
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-or-publishable-key
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

Run locally:

```sh
cd backend
.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

For Expo Go on a physical phone, bind the backend to your LAN:

```sh
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Verify:

```sh
python scripts/smoke_check.py
```

Optional live Supabase flow check with an existing test user:

```sh
$env:LIVE_TEST_EMAIL="test@example.com"
$env:LIVE_TEST_PASSWORD="test-password"
python scripts/live_smoke_check.py
```

Or create a temporary auth user automatically:

```sh
$env:LIVE_TEST_CREATE_TEMP_USER="1"
python scripts/live_smoke_check.py
```

You can also set `SUPABASE_ACCESS_TOKEN` instead of email/password. The script creates a timestamped test organization, closes its test session, and deletes the test organization. Temporary-user mode also deletes the temporary auth user.

## 4. Expo app

Create `.env`:

```sh
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-or-publishable-key
EXPO_PUBLIC_MATCH_FLOW_API_URL=http://your-computer-lan-ip:8000
EXPO_PUBLIC_ANDROID_EMULATOR_MATCH_FLOW_API_URL=http://10.0.2.2:8000
```

On this machine right now, the Wi-Fi LAN IP is `192.168.4.21`, so the local Expo Go value is `http://192.168.4.21:8000`. Use `http://10.0.2.2:8000` for the Android emulator on this PC. Use `http://127.0.0.1:8000` only for iOS simulator or desktop preview.

Expo reads `EXPO_PUBLIC_*` values when the dev server starts. If the Android emulator still shows an old backend URL after editing `.env`, stop Expo and restart with:

```sh
npm run android:emulator
```

LittlePickle is developed iOS-first, but Android is now an active parallel target. Android emulator screenshots are expected and should be used to catch layout, permission, keyboard, camera, image-picker, and media-library issues while preserving the iOS-first visual direction.

`EXPO_PUBLIC_DEFAULT_SESSION_ID` is optional and should only be used for local debugging with a known session ID. Normal users should start or resume sessions from Home.

## 5. First live test

1. Start the backend.
2. Start Expo with `npm run dev:lan`.
3. For PC emulator preview, start the Android emulator and run `npm run android`.
4. Open the app and confirm Home is the first screen.
5. With a signed-in Supabase session available, create an organization and set the court count.
6. Add enough players to the roster.
7. Start a play session from Home.
8. Confirm Play shows one disjoint recommendation per usable open court, capped by one match per four available players.
9. Confirm players who sat out the prior opportunity are included whenever the available court capacity allows.
10. Start one recommendation and confirm the other coordinated recommendations remain available for their assigned courts.
11. If every court is active, confirm recommendation start buttons show `Courts full`.
12. Report a score.
13. Confirm the queue advances and new recommendations appear. With four equally rated players, repeat a decisive result and confirm the next recommendation splits the prior winners across the two teams.

## 6. Deployment

The backend is scaffolded for Render with:

```sh
render.yaml
backend/Dockerfile
```

After deploying the backend, set `EXPO_PUBLIC_MATCH_FLOW_API_URL` to the deployed API URL.
