# LittlePickle Match Flow API

FastAPI service for the match-flow commands that should stay authoritative:

- scheduling and permanently completing Supabase authentication-account deletion
- completing a match and generating the next recommendations
- passing a player and regenerating recommendations
- accepting a recommendation and creating the active match
- regenerating recommendations for an active session

The Expo app can still read ordinary data directly from Supabase. This service exists for queue/match mutations and the recommendation algorithm.

## Environment

Create `backend/.env`:

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

The service role key must only live on the server. Do not put it in the Expo app.
`SMTP2GO_API_KEY` is required for league QR code email delivery. The `SMTP_*` settings are an optional fallback if you prefer direct SMTP.

## Run locally

```sh
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

For Expo Go on a physical phone, expose the backend on your LAN:

```sh
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Health check:

```sh
curl http://127.0.0.1:8000/health
```

Run smoke checks:

```sh
python scripts/smoke_check.py
```

Run the live Supabase smoke check with an existing test user:

```sh
$env:LIVE_TEST_EMAIL="test@example.com"
$env:LIVE_TEST_PASSWORD="test-password"
python scripts/live_smoke_check.py
```

For a fully temporary test user, use the server-only service role key in `backend/.env`:

```sh
$env:LIVE_TEST_CREATE_TEMP_USER="1"
python scripts/live_smoke_check.py
```

Alternatively, set `SUPABASE_ACCESS_TOKEN` to a signed-in test user's access token. The live smoke check creates a timestamped test organization, guest players, a session, regenerates recommendations, starts a match, reports a score, passes a player, closes the session, and deletes the test organization. Temporary-user mode also deletes the temporary auth user.

Run pytest checks:

```sh
pytest -q
```

On the current Windows desktop shell, pytest may print all passing tests and then hang during process teardown. The smoke check exits cleanly and covers the same local API contract.

## Deploy

The backend includes a Dockerfile and a Render blueprint at the repo root:

```sh
backend/Dockerfile
render.yaml
```

Set these production environment variables in the host:

```sh
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
CORS_ALLOWED_ORIGINS
SMTP2GO_API_KEY
EMAIL_FROM
EMAIL_SENDER_NAME
SMTP_HOST
SMTP_PORT
SMTP_USERNAME
SMTP_PASSWORD
SMTP_SENDER
SMTP_USE_TLS
```

## Local preview without Supabase

`POST /recommendations/preview` accepts a snapshot and returns one coordinated,
disjoint recommendation per usable open court (and no more than one match per
four available players):

```json
{
  "organization": {
    "id": "sample-club",
    "number_of_courts": 3
  },
  "session": {
    "id": "sample-session",
    "status": "open",
    "current_round": 0,
    "recommendation_version": 0
  },
  "open_court_numbers": [1, 2, 3],
  "players": [
    { "id": "p01", "name": "Avery", "skill": 3.6, "rounds_waiting": 1, "queue_position": 0, "games_played": 0 },
    { "id": "p02", "name": "Blake", "skill": 3.55, "rounds_waiting": 1, "queue_position": 1, "games_played": 0 },
    { "id": "p03", "name": "Casey", "skill": 3.7, "rounds_waiting": 0, "queue_position": 2, "games_played": 0 },
    { "id": "p04", "name": "Devon", "skill": 3.45, "rounds_waiting": 0, "queue_position": 3, "games_played": 0 }
  ]
}
```

## Supabase command flow

Apply every file in `supabase/migrations/` in timestamp order, then call API commands with the signed-in user's Supabase access token:

```http
Authorization: Bearer <supabase-access-token>
```

Main flow:

1. `POST /account/deletion` validates the bearer token, leaves every league, schedules permanent account deletion after 30 days, and immediately bans the Supabase Auth user. The retention worker removes account-owned profile images and the Auth user when deletion becomes due.
2. `POST /recommendations/{recommendation_id}/accept` creates an active match on the requested court or lowest open court.
3. `POST /matches/{match_id}/complete` saves a mode-matched result, advances queue state, regenerates recommendations, stores the new batch in Supabase, and returns it. Send either `{"result_mode":"score","team_one_score":11,"team_two_score":7}` or `{"result_mode":"win_loss","winning_team":1}`.
4. `POST /sessions/{session_id}/matches/custom` creates and completes a match for four selected current-session players without requiring a previously started match. It accepts the same discriminated result fields, then advances the queue and regenerates recommendations through the normal completion flow.
5. `POST /recommendations/{recommendation_id}/pass-player` moves the passed player to the end of the queue, regenerates recommendations, stores the new batch, and returns it.

Supabase RPCs used by the Expo app:

- `my_profile`
- `update_my_profile`
- `ensure_current_user_player`
- `set_my_league_player`
- `my_organizations`
- `search_organizations`
- `join_organization`
- `create_organization`
- `organization_members_for_admin`
- `organization_players_for_admin`
- `update_organization_settings`
- `set_organization_score_mode`
- `set_organization_member_role`
- `create_player`
- `update_organization_player`
- `leave_my_league`
- `create_play_session`
- `organization_open_sessions`
- `close_play_session`
- `add_player_to_session`
- `remove_player_from_session`
- `session_player_options`
- `session_recommendation_snapshot`
- `authorized_session_recommendation_snapshot` (FastAPI regeneration only)
- `active_recommendations`
- `active_matches`
- `completed_matches`
- `update_completed_match_result`
- `schedule_current_account_deletion`

Recommendation batches are stored with `replace_recommendation_batch_v2`,
which rejects stale queue versions and returns an existing same-version batch
idempotently.

Completed match results update `players.rating` permanently with a team Elo
adjustment. The optimizer consumes that stored rating directly; there is no
session-only form adjustment. `player_rating_events` records each match's
before/after values, and a later result correction replaces the original
adjustment instead of applying a second one.
