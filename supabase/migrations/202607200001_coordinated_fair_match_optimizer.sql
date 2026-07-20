-- Coordinated fair-match optimizer v2.
-- Recommendation versions make generation compare-and-swap safe while the
-- open-court snapshot lets the backend produce one disjoint match per court.

alter table public.play_sessions
add column if not exists recommendation_version bigint not null default 0;

alter table public.play_sessions
drop constraint if exists play_sessions_recommendation_version_nonnegative;

alter table public.play_sessions
add constraint play_sessions_recommendation_version_nonnegative
check (recommendation_version >= 0);

alter table public.recommendation_batches
add column if not exists generated_for_version bigint;

create index if not exists recommendation_batches_session_version_idx
on public.recommendation_batches (
  session_id,
  generated_for_version,
  algorithm_version,
  created_at desc
);

create or replace function public.bump_session_recommendation_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  if tg_op = 'DELETE' then
    v_session_id := old.session_id;
  else
    v_session_id := new.session_id;
  end if;

  update public.play_sessions
  set recommendation_version = recommendation_version + 1
  where id = v_session_id
    and status = 'open';

  update public.recommendation_batches
  set status = 'superseded'
  where session_id = v_session_id
    and status = 'active';

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists session_players_bump_recommendation_version
on public.session_players;

create trigger session_players_bump_recommendation_version
after insert or update or delete on public.session_players
for each row execute function public.bump_session_recommendation_version();

drop trigger if exists matches_bump_recommendation_version
on public.matches;

create trigger matches_bump_recommendation_version
after insert or update or delete on public.matches
for each row execute function public.bump_session_recommendation_version();

create or replace function public.require_active_recommendation_batch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.recommendation_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.match_recommendations mr
    join public.recommendation_batches rb on rb.id = mr.batch_id
    where mr.id = new.recommendation_id
      and mr.session_id = new.session_id
      and mr.status = 'pending'
      and rb.status = 'active'
  ) then
    raise exception 'recommendation batch is no longer active' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists matches_require_active_recommendation_batch
on public.matches;

create trigger matches_require_active_recommendation_batch
before insert on public.matches
for each row execute function public.require_active_recommendation_batch();

create or replace function public.bump_player_recommendation_versions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.rating is not distinct from old.rating
    and new.active is not distinct from old.active
  then
    return new;
  end if;

  update public.play_sessions ps
  set recommendation_version = ps.recommendation_version + 1
  where ps.status = 'open'
    and exists (
      select 1
      from public.session_players sp
      where sp.session_id = ps.id
        and sp.player_id = new.id
        and sp.status = 'active'
    );

  update public.recommendation_batches rb
  set status = 'superseded'
  where rb.status = 'active'
    and exists (
      select 1
      from public.play_sessions ps
      join public.session_players sp on sp.session_id = ps.id
      where ps.id = rb.session_id
        and ps.status = 'open'
        and sp.player_id = new.id
        and sp.status = 'active'
    );

  return new;
end;
$$;

drop trigger if exists players_bump_recommendation_versions
on public.players;

create trigger players_bump_recommendation_versions
after update of rating, active on public.players
for each row execute function public.bump_player_recommendation_versions();

revoke all on function public.bump_session_recommendation_version()
from public, anon, authenticated;
revoke all on function public.require_active_recommendation_batch()
from public, anon, authenticated;
revoke all on function public.bump_player_recommendation_versions()
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
            'id', p.id,
            'name', p.display_name,
            'skill', p.rating,
            'profile_image_path', p.profile_image_path,
            'rounds_waiting', sp.rounds_waiting,
            'queue_position', sp.queue_position,
            'games_played', sp.games_played
          )
          order by sp.queue_position
        )
        from public.session_players sp
        join public.players p on p.id = sp.player_id
        where sp.session_id = v_session.id
          and sp.status = 'active'
          and p.active
          and not exists (
            select 1
            from public.matches m
            join public.match_players mp on mp.match_id = m.id
            where m.session_id = sp.session_id
              and m.status = 'active'
              and mp.player_id = sp.player_id
          )
      ),
      '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.authorized_session_recommendation_snapshot(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_organization_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select organization_id into v_organization_id
  from public.play_sessions
  where id = p_session_id;

  if not found then
    raise exception 'play session % not found', p_session_id using errcode = 'P0002';
  end if;

  if not public.is_org_member(v_organization_id, auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return public.session_recommendation_snapshot(p_session_id);
end;
$$;

revoke all on function public.authorized_session_recommendation_snapshot(uuid)
from public, anon, authenticated;
grant execute on function public.authorized_session_recommendation_snapshot(uuid)
to authenticated;

create or replace function public.replace_recommendation_batch_v2(
  p_session_id uuid,
  p_generated_after_match_id uuid,
  p_algorithm_version text,
  p_expected_recommendation_version bigint,
  p_recommendations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.play_sessions%rowtype;
  v_batch_id uuid;
  v_recommendation jsonb;
  v_recommendation_id uuid;
  v_recommendation_ids jsonb := '[]'::jsonb;
  v_player jsonb;
  v_player_id uuid;
  v_court_number integer;
  v_seen_player_ids uuid[] := array[]::uuid[];
  v_seen_court_numbers integer[] := array[]::integer[];
begin
  select * into v_session
  from public.play_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'play session % not found', p_session_id using errcode = 'P0002';
  end if;

  if v_session.status <> 'open' then
    raise exception 'play session is not open' using errcode = '23514';
  end if;

  if v_session.recommendation_version <> p_expected_recommendation_version then
    raise exception 'stale recommendation version: expected %, current %',
      p_expected_recommendation_version,
      v_session.recommendation_version
      using errcode = '40001';
  end if;

  select id into v_batch_id
  from public.recommendation_batches
  where session_id = p_session_id
    and generated_for_version = p_expected_recommendation_version
    and algorithm_version = p_algorithm_version
    and status = 'active'
  order by created_at desc
  limit 1;

  if found then
    select coalesce(
      jsonb_agg(
        jsonb_build_object('rank', mr.rank, 'id', mr.id)
        order by mr.rank
      ),
      '[]'::jsonb
    ) into v_recommendation_ids
    from public.match_recommendations mr
    where mr.batch_id = v_batch_id;

    return jsonb_build_object(
      'batch_id', v_batch_id,
      'recommendation_ids', v_recommendation_ids
    );
  end if;

  if p_recommendations is null or jsonb_typeof(p_recommendations) <> 'array' then
    raise exception 'recommendations must be a JSON array' using errcode = '23514';
  end if;

  update public.recommendation_batches
  set status = 'superseded'
  where session_id = p_session_id
    and status = 'active';

  update public.match_recommendations
  set status = 'superseded'
  where session_id = p_session_id
    and status = 'pending';

  insert into public.recommendation_batches (
    session_id,
    generated_after_match_id,
    algorithm_version,
    generated_for_version,
    status
  )
  values (
    p_session_id,
    p_generated_after_match_id,
    p_algorithm_version,
    p_expected_recommendation_version,
    'active'
  )
  returning id into v_batch_id;

  for v_recommendation in
    select value
    from jsonb_array_elements(p_recommendations)
    order by (value ->> 'rank')::integer
  loop
    v_court_number := nullif(v_recommendation ->> 'court_number', '')::integer;

    if v_court_number is null
      or v_court_number < 1
      or v_court_number > v_session.court_count_snapshot
    then
      raise exception 'recommendation court is outside this session court count'
        using errcode = '23514';
    end if;

    if v_court_number = any(v_seen_court_numbers) then
      raise exception 'recommendation courts must be unique' using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.matches active_match
      where active_match.session_id = p_session_id
        and active_match.status = 'active'
        and active_match.court_number = v_court_number
    ) then
      raise exception 'court % is already active', v_court_number using errcode = '23514';
    end if;

    if jsonb_typeof(v_recommendation -> 'players') is distinct from 'array'
      or jsonb_array_length(v_recommendation -> 'players') <> 4
    then
      raise exception 'recommendations require exactly four players'
        using errcode = '23514';
    end if;

    v_seen_court_numbers := array_append(v_seen_court_numbers, v_court_number);

    insert into public.match_recommendations (
      batch_id,
      session_id,
      rank,
      court_number,
      quality_score,
      team_average_skill_difference,
      player_skill_spread,
      predicted_team_one_win_probability,
      payload
    )
    values (
      v_batch_id,
      p_session_id,
      (v_recommendation ->> 'rank')::integer,
      v_court_number,
      (v_recommendation ->> 'quality_score')::numeric,
      (v_recommendation ->> 'team_average_skill_difference')::numeric,
      (v_recommendation ->> 'player_skill_spread')::numeric,
      (v_recommendation ->> 'predicted_team_one_win_probability')::numeric,
      v_recommendation - 'players'
    )
    returning id into v_recommendation_id;

    v_recommendation_ids := v_recommendation_ids || jsonb_build_array(
      jsonb_build_object(
        'rank', (v_recommendation ->> 'rank')::integer,
        'id', v_recommendation_id
      )
    );

    for v_player in
      select value
      from jsonb_array_elements(v_recommendation -> 'players')
      order by (value ->> 'team_number')::integer, (value ->> 'slot_number')::integer
    loop
      v_player_id := (v_player ->> 'player_id')::uuid;
      if v_player_id = any(v_seen_player_ids) then
        raise exception 'players cannot appear on multiple recommended courts'
          using errcode = '23514';
      end if;

      if not exists (
        select 1
        from public.session_players sp
        join public.players p on p.id = sp.player_id
        where sp.session_id = p_session_id
          and sp.player_id = v_player_id
          and sp.status = 'active'
          and p.active
      ) then
        raise exception 'recommended player is not active in this session'
          using errcode = '23514';
      end if;

      if exists (
        select 1
        from public.matches active_match
        join public.match_players active_player
          on active_player.match_id = active_match.id
        where active_match.session_id = p_session_id
          and active_match.status = 'active'
          and active_player.player_id = v_player_id
      ) then
        raise exception 'recommended player is already in an active match'
          using errcode = '23514';
      end if;

      v_seen_player_ids := array_append(v_seen_player_ids, v_player_id);

      insert into public.recommendation_players (
        recommendation_id,
        player_id,
        team_number,
        slot_number
      )
      values (
        v_recommendation_id,
        v_player_id,
        (v_player ->> 'team_number')::integer,
        (v_player ->> 'slot_number')::integer
      );
    end loop;
  end loop;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'recommendation_ids', v_recommendation_ids
  );
end;
$$;

revoke all on function public.replace_recommendation_batch_v2(
  uuid, uuid, text, bigint, jsonb
) from public, anon, authenticated;
grant execute on function public.replace_recommendation_batch_v2(
  uuid, uuid, text, bigint, jsonb
) to service_role;

create or replace function public.active_recommendations(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_session public.play_sessions%rowtype;
  v_batch public.recommendation_batches%rowtype;
  v_recommendations jsonb := '[]'::jsonb;
begin
  select * into v_session
  from public.play_sessions
  where id = p_session_id;

  if not found then
    raise exception 'play session % not found', p_session_id using errcode = 'P0002';
  end if;

  if v_session.status <> 'open' or not exists (
    select 1
    from public.session_players
    where session_id = p_session_id
      and status = 'active'
  ) then
    return jsonb_build_object(
      'algorithm_version', null,
      'session_id', p_session_id,
      'recommendation_count', 0,
      'batch_id', null,
      'recommendations', v_recommendations
    );
  end if;

  select * into v_batch
  from public.recommendation_batches
  where session_id = p_session_id
    and status = 'active'
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'algorithm_version', null,
      'session_id', p_session_id,
      'recommendation_count', 0,
      'batch_id', null,
      'recommendations', v_recommendations
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', mr.id,
        'rank', mr.rank,
        'court_number', mr.court_number,
        'quality_score', mr.quality_score,
        'team_average_skill_difference', mr.team_average_skill_difference,
        'player_skill_spread', mr.player_skill_spread,
        'predicted_team_one_win_probability', mr.predicted_team_one_win_probability,
        'fairness_score', coalesce((mr.payload ->> 'fairness_score')::integer, 0),
        'players', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'player_id', p.id,
                'team_number', rp.team_number,
                'slot_number', rp.slot_number,
                'name', p.display_name,
                'skill', p.rating,
                'profile_image_path', p.profile_image_path,
                'rounds_waiting', coalesce(sp.rounds_waiting, 0),
                'queue_position', coalesce(sp.queue_position, 0),
                'games_played', coalesce(sp.games_played, 0)
              )
              order by rp.team_number, rp.slot_number
            )
            from public.recommendation_players rp
            join public.players p on p.id = rp.player_id
            left join public.session_players sp
              on sp.session_id = mr.session_id
             and sp.player_id = rp.player_id
            where rp.recommendation_id = mr.id
          ),
          '[]'::jsonb
        )
      )
      order by mr.rank
    ),
    '[]'::jsonb
  ) into v_recommendations
  from public.match_recommendations mr
  where mr.batch_id = v_batch.id
    and mr.status = 'pending'
    and not exists (
      select 1
      from public.recommendation_players queued_recommendation_player
      left join public.session_players queued_player
        on queued_player.session_id = p_session_id
       and queued_player.player_id = queued_recommendation_player.player_id
      where queued_recommendation_player.recommendation_id = mr.id
        and queued_player.status is distinct from 'active'
    )
    and not exists (
      select 1
      from public.recommendation_players conflicting_player
      join public.match_players active_player
        on active_player.player_id = conflicting_player.player_id
      join public.matches active_match
        on active_match.id = active_player.match_id
      where conflicting_player.recommendation_id = mr.id
        and active_match.session_id = p_session_id
        and active_match.status = 'active'
    );

  return jsonb_build_object(
    'algorithm_version', v_batch.algorithm_version,
    'session_id', p_session_id,
    'recommendation_count', jsonb_array_length(v_recommendations),
    'batch_id', v_batch.id,
    'recommendations', v_recommendations
  );
end;
$$;

grant execute on function public.active_recommendations(uuid) to anon, authenticated;
