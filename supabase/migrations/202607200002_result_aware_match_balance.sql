-- Feed recent completed results back into match quality without changing the
-- league's stored player ratings. A bounded session-form signal makes repeated
-- one-sided four-player matches rebalance while preserving the v2 wait rules.

create or replace function public.recent_session_player_form(
  p_session_id uuid,
  p_player_id uuid
)
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  with recent_matches as (
    select
      m.id,
      row_number() over (
        order by m.completed_at desc, m.id desc
      ) as recency_rank
    from public.matches m
    where m.session_id = p_session_id
      and m.status = 'completed'
      and m.completed_at is not null
    order by m.completed_at desc, m.id desc
    limit 12
  ),
  weighted_results as (
    select
      (13 - recent_match.recency_rank)::numeric / 12::numeric as weight,
      case
        when latest_score.winning_team = match_player.team_number then 1
        else -1
      end as outcome
    from recent_matches recent_match
    join public.match_players match_player
      on match_player.match_id = recent_match.id
    join lateral (
      select score.winning_team
      from public.match_scores score
      where score.match_id = recent_match.id
      order by score.created_at desc, score.id desc
      limit 1
    ) latest_score on true
    where match_player.player_id = p_player_id
  )
  select coalesce(
    round(
      0.75::numeric
        * sum(weight * outcome)
        / (2::numeric + sum(weight)),
      4
    ),
    0::numeric
  )
  from weighted_results;
$$;

revoke all on function public.recent_session_player_form(uuid, uuid)
from public, anon, authenticated;

create or replace function public.bump_match_score_recommendation_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_session_id uuid;
begin
  if tg_op = 'DELETE' then
    v_match_id := old.match_id;
  else
    v_match_id := new.match_id;
  end if;

  select session_id into v_session_id
  from public.matches
  where id = v_match_id;

  if v_session_id is not null then
    update public.play_sessions
    set recommendation_version = recommendation_version + 1
    where id = v_session_id
      and status = 'open';

    update public.recommendation_batches
    set status = 'superseded'
    where session_id = v_session_id
      and status = 'active';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists match_scores_bump_recommendation_version
on public.match_scores;

create trigger match_scores_bump_recommendation_version
after insert or update or delete on public.match_scores
for each row execute function public.bump_match_score_recommendation_version();

revoke all on function public.bump_match_score_recommendation_version()
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
            'recent_form_adjustment', public.recent_session_player_form(
              v_session.id,
              p.id
            ),
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

-- Existing pending batches were generated without result feedback. Hide them
-- and advance the version so the next refresh must use this snapshot contract.
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
