-- Replace session-only form with permanent, auditable team Elo updates.
-- The optimizer and the roster now share one source of truth: players.rating.

alter table public.matches
add column if not exists rating_processed_at timestamptz;

create table if not exists public.player_rating_events (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  score_id uuid references public.match_scores(id) on delete set null,
  team_number integer not null check (team_number in (1, 2)),
  winning_team integer not null check (winning_team in (1, 2)),
  rating_before numeric(4, 2) not null check (rating_before > 0),
  rating_after numeric(4, 2) not null check (rating_after > 0),
  rating_delta numeric(4, 2) not null,
  expected_team_one_win_probability numeric(8, 6) not null
    check (
      expected_team_one_win_probability >= 0
      and expected_team_one_win_probability <= 1
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, player_id)
);

create index if not exists player_rating_events_player_created_idx
on public.player_rating_events (player_id, created_at desc);

alter table public.player_rating_events enable row level security;

-- Rating events are an internal audit ledger. Player ratings themselves remain
-- visible through the existing roster and match-history interfaces.
revoke all on table public.player_rating_events from public, anon, authenticated;

-- Preserve the result evidence already accumulated by v3. Each player receives
-- the form adjustment from their most recently started open session exactly
-- once, before the temporary form function is removed.
with ranked_open_session_forms as (
  select
    sp.player_id,
    public.recent_session_player_form(ps.id, sp.player_id) as adjustment,
    row_number() over (
      partition by sp.player_id
      order by ps.started_at desc, ps.id
    ) as session_rank
  from public.play_sessions ps
  join public.session_players sp on sp.session_id = ps.id
  where ps.status = 'open'
    and sp.status = 'active'
),
latest_open_session_forms as (
  select player_id, adjustment
  from ranked_open_session_forms
  where session_rank = 1
)
update public.players player
set rating = greatest(
  0.01::numeric,
  round(player.rating + form.adjustment, 2)
)
from latest_open_session_forms form
where player.id = form.player_id
  and form.adjustment <> 0;

-- Historical matches predate the permanent rating ledger. Mark them processed
-- so editing one later cannot unexpectedly apply a brand-new rating change.
update public.matches
set rating_processed_at = coalesce(completed_at, now())
where status = 'completed'
  and rating_processed_at is null;

drop trigger if exists match_scores_bump_recommendation_version
on public.match_scores;

drop function if exists public.bump_match_score_recommendation_version();

create or replace function public.apply_match_rating_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_match_player record;
  v_existing_event public.player_rating_events%rowtype;
  v_player_count integer;
  v_team_one_count integer;
  v_team_two_count integer;
  v_event_count integer;
  v_team_one_average numeric;
  v_team_two_average numeric;
  v_expected_team_one numeric;
  v_team_one_result numeric;
  v_team_one_delta numeric;
  v_player_delta numeric;
  v_rating_before numeric;
  v_rating_after numeric;
  v_replacement_delta numeric;
begin
  select * into v_match
  from public.matches
  where id = new.match_id
  for update;

  if not found then
    raise exception 'match % not found', new.match_id using errcode = 'P0002';
  end if;

  if v_match.status <> 'completed' then
    raise exception 'ratings require a completed match' using errcode = '23514';
  end if;

  select
    count(*),
    count(*) filter (where team_number = 1),
    count(*) filter (where team_number = 2)
  into v_player_count, v_team_one_count, v_team_two_count
  from public.match_players
  where match_id = new.match_id;

  if v_player_count <> 4 or v_team_one_count <> 2 or v_team_two_count <> 2 then
    raise exception 'match % must contain two teams of two players', new.match_id
      using errcode = '23514';
  end if;

  select count(*) into v_event_count
  from public.player_rating_events
  where match_id = new.match_id;

  -- A processed legacy match has no event ledger. Its old result remains valid,
  -- but result edits must not introduce a first-time rating adjustment.
  if v_match.rating_processed_at is not null and v_event_count = 0 then
    return new;
  end if;

  if v_event_count not in (0, 4) then
    raise exception 'match % has an incomplete rating ledger', new.match_id
      using errcode = '23514';
  end if;

  -- Lock all four player rows in stable order to serialize simultaneous court
  -- completions that share a player because of malformed external data.
  perform player.id
  from public.players player
  join public.match_players match_player
    on match_player.player_id = player.id
  where match_player.match_id = new.match_id
  order by player.id
  for update of player;

  if v_event_count = 0 then
    select
      avg(player.rating) filter (where match_player.team_number = 1),
      avg(player.rating) filter (where match_player.team_number = 2)
    into v_team_one_average, v_team_two_average
    from public.match_players match_player
    join public.players player on player.id = match_player.player_id
    where match_player.match_id = new.match_id;
  else
    -- Result corrections replace the original match adjustment. They use the
    -- same pre-match ratings rather than treating the correction as a new game.
    select
      avg(event.rating_before) filter (where event.team_number = 1),
      avg(event.rating_before) filter (where event.team_number = 2)
    into v_team_one_average, v_team_two_average
    from public.player_rating_events event
    where event.match_id = new.match_id;
  end if;

  v_expected_team_one := (
    1.0 / (
      1.0 + exp(
        greatest(
          -60.0,
          least(
            60.0,
            -(
              (v_team_one_average - v_team_two_average)::double precision
              / 0.35
            )
          )
        )
      )
    )
  )::numeric;
  v_team_one_result := case when new.winning_team = 1 then 1 else 0 end;
  v_team_one_delta := round(
    0.20::numeric * (v_team_one_result - v_expected_team_one),
    2
  );

  for v_match_player in
    select
      player.id as player_id,
      player.rating,
      match_player.team_number
    from public.match_players match_player
    join public.players player on player.id = match_player.player_id
    where match_player.match_id = new.match_id
    order by player.id
  loop
    v_player_delta := case
      when v_match_player.team_number = 1 then v_team_one_delta
      else -v_team_one_delta
    end;

    if v_event_count = 0 then
      v_rating_before := v_match_player.rating;
      v_rating_after := greatest(
        0.01::numeric,
        round(v_rating_before + v_player_delta, 2)
      );
      v_replacement_delta := v_rating_after - v_rating_before;

      update public.players
      set rating = v_rating_after
      where id = v_match_player.player_id;

      insert into public.player_rating_events (
        match_id,
        player_id,
        score_id,
        team_number,
        winning_team,
        rating_before,
        rating_after,
        rating_delta,
        expected_team_one_win_probability
      )
      values (
        new.match_id,
        v_match_player.player_id,
        new.id,
        v_match_player.team_number,
        new.winning_team,
        v_rating_before,
        v_rating_after,
        v_replacement_delta,
        round(v_expected_team_one, 6)
      );
    else
      select * into strict v_existing_event
      from public.player_rating_events
      where match_id = new.match_id
        and player_id = v_match_player.player_id;

      v_rating_before := v_existing_event.rating_before;
      v_rating_after := greatest(
        0.01::numeric,
        round(v_rating_before + v_player_delta, 2)
      );
      v_replacement_delta := v_rating_after - v_rating_before;

      update public.players
      set rating = greatest(
        0.01::numeric,
        round(
          rating - v_existing_event.rating_delta + v_replacement_delta,
          2
        )
      )
      where id = v_match_player.player_id;

      update public.player_rating_events
      set score_id = new.id,
          winning_team = new.winning_team,
          rating_after = v_rating_after,
          rating_delta = v_replacement_delta,
          expected_team_one_win_probability = round(v_expected_team_one, 6),
          updated_at = now()
      where match_id = new.match_id
        and player_id = v_match_player.player_id;
    end if;
  end loop;

  update public.matches
  set rating_processed_at = now()
  where id = new.match_id;

  return new;
end;
$$;

drop trigger if exists match_scores_apply_permanent_ratings
on public.match_scores;

create trigger match_scores_apply_permanent_ratings
after insert on public.match_scores
for each row execute function public.apply_match_rating_result();

revoke all on function public.apply_match_rating_result()
from public, anon, authenticated;

create or replace function public.session_recommendation_snapshot(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_session public.play_sessions%rowtype;
  v_organization public.organizations%rowtype;
begin
  select * into v_session
  from public.play_sessions
  where id = p_session_id;

  if not found then
    raise exception 'play session % not found', p_session_id using errcode = 'P0002';
  end if;

  select * into v_organization
  from public.organizations
  where id = v_session.organization_id;

  return jsonb_build_object(
    'organization', jsonb_build_object(
      'id', v_organization.id,
      'number_of_courts', v_session.court_count_snapshot,
      'score_mode_enabled', v_organization.score_mode_enabled
    ),
    'session', jsonb_build_object(
      'id', v_session.id,
      'status', v_session.status,
      'current_round', v_session.current_round,
      'recommendation_version', v_session.recommendation_version
    ),
    'open_court_numbers', coalesce(
      (
        select jsonb_agg(candidate.court_number order by candidate.court_number)
        from generate_series(1, v_session.court_count_snapshot)
          as candidate(court_number)
        where not exists (
          select 1
          from public.matches active_match
          where active_match.session_id = v_session.id
            and active_match.status = 'active'
            and active_match.court_number = candidate.court_number
        )
      ),
      '[]'::jsonb
    ),
    'players', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', player.id,
            'name', player.display_name,
            'skill', player.rating,
            'profile_image_path', player.profile_image_path,
            'rounds_waiting', session_player.rounds_waiting,
            'queue_position', session_player.queue_position,
            'games_played', session_player.games_played
          )
          order by session_player.queue_position
        )
        from public.session_players session_player
        join public.players player on player.id = session_player.player_id
        where session_player.session_id = v_session.id
          and session_player.status = 'active'
          and player.active
          and not exists (
            select 1
            from public.matches active_match
            join public.match_players active_match_player
              on active_match_player.match_id = active_match.id
            where active_match.session_id = session_player.session_id
              and active_match.status = 'active'
              and active_match_player.player_id = session_player.player_id
          )
      ),
      '[]'::jsonb
    )
  );
end;
$$;

drop function if exists public.recent_session_player_form(uuid, uuid);

-- Force every open session to discard v3 batches and regenerate from the
-- newly permanent ratings.
update public.play_sessions
set recommendation_version = recommendation_version + 1
where status = 'open';

update public.recommendation_batches batch
set status = 'superseded'
where batch.status = 'active'
  and exists (
    select 1
    from public.play_sessions session
    where session.id = batch.session_id
      and session.status = 'open'
  );
