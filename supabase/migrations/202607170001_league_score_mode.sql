alter table public.organizations
add column if not exists score_mode_enabled boolean not null default true;

alter table public.match_scores
add column if not exists result_mode text not null default 'score';

alter table public.match_scores
add column if not exists winning_team integer;

alter table public.match_scores
add column if not exists is_legacy_tie boolean not null default false;

alter table public.match_scores
alter column team_one_score drop not null;

alter table public.match_scores
alter column team_two_score drop not null;

update public.match_scores
set winning_team = case
  when team_one_score > team_two_score then 1
  when team_two_score > team_one_score then 2
  else null
end
where result_mode = 'score'
  and winning_team is null;

update public.match_scores
set is_legacy_tie = true
where result_mode = 'score'
  and team_one_score = team_two_score;

alter table public.match_scores
drop constraint if exists match_scores_result_mode_check;

alter table public.match_scores
add constraint match_scores_result_mode_check
check (result_mode in ('score', 'win_loss'));

alter table public.match_scores
drop constraint if exists match_scores_result_shape_check;

alter table public.match_scores
add constraint match_scores_result_shape_check
check (
  (
    result_mode = 'score'
    and team_one_score is not null
    and team_two_score is not null
    and (
      (
        is_legacy_tie
        and team_one_score = team_two_score
        and winning_team is null
      )
      or (
        not is_legacy_tie
        and team_one_score <> team_two_score
        and (
          (team_one_score > team_two_score and winning_team = 1)
          or (team_two_score > team_one_score and winning_team = 2)
        )
      )
    )
  )
  or (
    result_mode = 'win_loss'
    and not is_legacy_tie
    and team_one_score is null
    and team_two_score is null
    and winning_team in (1, 2)
  )
);

create or replace function public.normalized_match_result(
  p_score_mode_enabled boolean,
  p_result_mode text,
  p_team_one_score integer,
  p_team_two_score integer,
  p_winning_team integer
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_expected_mode text := case when p_score_mode_enabled then 'score' else 'win_loss' end;
  v_winning_team integer;
begin
  if p_result_mode is distinct from v_expected_mode then
    raise exception 'score mode changed; reopen the result form and try again' using errcode = '40001';
  end if;

  if p_result_mode = 'score' then
    if p_team_one_score is null or p_team_two_score is null then
      raise exception 'both scores are required' using errcode = '23514';
    end if;

    if p_team_one_score < 0 or p_team_two_score < 0 then
      raise exception 'scores cannot be negative' using errcode = '23514';
    end if;

    if p_team_one_score = p_team_two_score then
      raise exception 'scores cannot be tied' using errcode = '23514';
    end if;

    v_winning_team := case when p_team_one_score > p_team_two_score then 1 else 2 end;

    return jsonb_build_object(
      'result_mode', 'score',
      'team_one_score', p_team_one_score,
      'team_two_score', p_team_two_score,
      'winning_team', v_winning_team
    );
  end if;

  if p_result_mode = 'win_loss' then
    if p_winning_team is null or p_winning_team not in (1, 2) then
      raise exception 'winning team must be 1 or 2' using errcode = '23514';
    end if;

    return jsonb_build_object(
      'result_mode', 'win_loss',
      'team_one_score', null,
      'team_two_score', null,
      'winning_team', p_winning_team
    );
  end if;

  raise exception 'result mode must be score or win_loss' using errcode = '23514';
end;
$$;

revoke all on function public.normalized_match_result(boolean, text, integer, integer, integer)
from public, anon, authenticated;

create or replace function public.complete_match_result_for_recommendations(
  p_match_id uuid,
  p_result_mode text,
  p_team_one_score integer default null,
  p_team_two_score integer default null,
  p_winning_team integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_session public.play_sessions%rowtype;
  v_score_mode_enabled boolean;
  v_result jsonb;
begin
  select * into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'match % not found', p_match_id using errcode = 'P0002';
  end if;

  select * into v_session
  from public.play_sessions
  where id = v_match.session_id
  for update;

  if not public.is_org_member(v_match.organization_id, auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_match.status <> 'active' then
    raise exception 'match is not active' using errcode = '23514';
  end if;

  select score_mode_enabled into v_score_mode_enabled
  from public.organizations
  where id = v_match.organization_id
  for share;

  v_result := public.normalized_match_result(
    v_score_mode_enabled,
    p_result_mode,
    p_team_one_score,
    p_team_two_score,
    p_winning_team
  );

  update public.matches
  set status = 'completed',
      completed_at = now()
  where id = p_match_id;

  insert into public.match_scores (
    match_id,
    result_mode,
    team_one_score,
    team_two_score,
    winning_team,
    reported_by
  )
  values (
    p_match_id,
    v_result ->> 'result_mode',
    (v_result ->> 'team_one_score')::integer,
    (v_result ->> 'team_two_score')::integer,
    (v_result ->> 'winning_team')::integer,
    auth.uid()
  );

  update public.play_sessions
  set current_round = current_round + 1
  where id = v_session.id;

  update public.session_players
  set queue_position = queue_position + 100000
  where session_id = v_session.id
    and status = 'active';

  with played as (
    select mp.player_id
    from public.match_players mp
    where mp.match_id = p_match_id
  ),
  ordered as (
    select
      sp.id,
      exists (select 1 from played p where p.player_id = sp.player_id) as did_play,
      exists (
        select 1
        from public.matches m
        join public.match_players mp on mp.match_id = m.id
        where m.session_id = sp.session_id
          and m.status = 'active'
          and mp.player_id = sp.player_id
      ) as still_playing,
      row_number() over (
        order by
          case when exists (select 1 from played p where p.player_id = sp.player_id) then 1 else 0 end,
          sp.queue_position
      ) - 1 as new_queue_position
    from public.session_players sp
    where sp.session_id = v_session.id
      and sp.status = 'active'
  )
  update public.session_players sp
  set queue_position = ordered.new_queue_position,
      games_played = case when ordered.did_play then sp.games_played + 1 else sp.games_played end,
      rounds_waiting = case
        when ordered.did_play then 0
        when ordered.still_playing then sp.rounds_waiting
        else sp.rounds_waiting + 1
      end
  from ordered
  where sp.id = ordered.id;

  return public.session_recommendation_snapshot(v_session.id);
end;
$$;

revoke all on function public.complete_match_result_for_recommendations(uuid, text, integer, integer, integer)
from public, anon, authenticated;

grant execute on function public.complete_match_result_for_recommendations(uuid, text, integer, integer, integer)
to authenticated;

create or replace function public.complete_match_for_recommendations(
  p_match_id uuid,
  p_team_one_score integer,
  p_team_two_score integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_score_mode_enabled boolean;
  v_winning_team integer;
begin
  if p_team_one_score is null or p_team_two_score is null then
    raise exception 'both scores are required' using errcode = '23514';
  end if;

  if p_team_one_score = p_team_two_score then
    raise exception 'scores cannot be tied' using errcode = '23514';
  end if;

  select o.score_mode_enabled into v_score_mode_enabled
  from public.matches m
  join public.organizations o on o.id = m.organization_id
  where m.id = p_match_id;

  if v_score_mode_enabled then
    return public.complete_match_result_for_recommendations(
      p_match_id,
      'score',
      p_team_one_score,
      p_team_two_score,
      null
    );
  end if;

  v_winning_team := case when p_team_one_score > p_team_two_score then 1 else 2 end;

  return public.complete_match_result_for_recommendations(
    p_match_id,
    'win_loss',
    null,
    null,
    v_winning_team
  );
end;
$$;

create or replace function public.complete_custom_match_result_for_recommendations(
  p_session_id uuid,
  p_team_one_player_one_id uuid,
  p_team_one_player_two_id uuid,
  p_team_two_player_one_id uuid,
  p_team_two_player_two_id uuid,
  p_result_mode text,
  p_team_one_score integer default null,
  p_team_two_score integer default null,
  p_winning_team integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.play_sessions%rowtype;
  v_match_id uuid;
  v_player_ids uuid[] := array[
    p_team_one_player_one_id,
    p_team_one_player_two_id,
    p_team_two_player_one_id,
    p_team_two_player_two_id
  ];
  v_unique_player_count integer;
begin
  select count(distinct player_id)
  into v_unique_player_count
  from unnest(v_player_ids) as selected_players(player_id);

  if v_unique_player_count <> 4 then
    raise exception 'custom matches require four distinct players' using errcode = '23514';
  end if;

  select * into v_session
  from public.play_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'play session % not found', p_session_id using errcode = 'P0002';
  end if;

  if not public.is_org_member(v_session.organization_id, auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_session.status <> 'open' then
    raise exception 'play session is not open' using errcode = '23514';
  end if;

  if (
    select count(*)
    from public.session_players sp
    where sp.session_id = p_session_id
      and sp.status = 'active'
      and sp.player_id = any(v_player_ids)
  ) <> 4 then
    raise exception 'custom match players must be active in this session' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.matches m
    join public.match_players mp on mp.match_id = m.id
    where m.session_id = p_session_id
      and m.status = 'active'
      and mp.player_id = any(v_player_ids)
  ) then
    raise exception 'custom match players cannot already be in an active match' using errcode = '23514';
  end if;

  insert into public.matches (
    organization_id,
    session_id,
    recommendation_id,
    court_number,
    status
  )
  values (
    v_session.organization_id,
    p_session_id,
    null,
    null,
    'active'
  )
  returning id into v_match_id;

  insert into public.match_players (match_id, player_id, team_number, slot_number)
  values
    (v_match_id, p_team_one_player_one_id, 1, 1),
    (v_match_id, p_team_one_player_two_id, 1, 2),
    (v_match_id, p_team_two_player_one_id, 2, 1),
    (v_match_id, p_team_two_player_two_id, 2, 2);

  return jsonb_build_object(
    'match_id', v_match_id,
    'snapshot', public.complete_match_result_for_recommendations(
      v_match_id,
      p_result_mode,
      p_team_one_score,
      p_team_two_score,
      p_winning_team
    )
  );
end;
$$;

revoke all on function public.complete_custom_match_result_for_recommendations(
  uuid, uuid, uuid, uuid, uuid, text, integer, integer, integer
) from public, anon, authenticated;

grant execute on function public.complete_custom_match_result_for_recommendations(
  uuid, uuid, uuid, uuid, uuid, text, integer, integer, integer
) to authenticated;

create or replace function public.complete_custom_match_for_recommendations(
  p_session_id uuid,
  p_team_one_player_one_id uuid,
  p_team_one_player_two_id uuid,
  p_team_two_player_one_id uuid,
  p_team_two_player_two_id uuid,
  p_team_one_score integer,
  p_team_two_score integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_score_mode_enabled boolean;
  v_winning_team integer;
begin
  if p_team_one_score is null or p_team_two_score is null then
    raise exception 'both scores are required' using errcode = '23514';
  end if;

  if p_team_one_score = p_team_two_score then
    raise exception 'scores cannot be tied' using errcode = '23514';
  end if;

  select o.score_mode_enabled into v_score_mode_enabled
  from public.play_sessions ps
  join public.organizations o on o.id = ps.organization_id
  where ps.id = p_session_id;

  if v_score_mode_enabled then
    return public.complete_custom_match_result_for_recommendations(
      p_session_id,
      p_team_one_player_one_id,
      p_team_one_player_two_id,
      p_team_two_player_one_id,
      p_team_two_player_two_id,
      'score',
      p_team_one_score,
      p_team_two_score,
      null
    );
  end if;

  v_winning_team := case when p_team_one_score > p_team_two_score then 1 else 2 end;

  return public.complete_custom_match_result_for_recommendations(
    p_session_id,
    p_team_one_player_one_id,
    p_team_one_player_two_id,
    p_team_two_player_one_id,
    p_team_two_player_two_id,
    'win_loss',
    null,
    null,
    v_winning_team
  );
end;
$$;

create or replace function public.update_completed_match_result(
  p_match_id uuid,
  p_result_mode text,
  p_team_one_score integer default null,
  p_team_two_score integer default null,
  p_winning_team integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_score public.match_scores%rowtype;
  v_score_mode_enabled boolean;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'match % not found', p_match_id using errcode = 'P0002';
  end if;

  if not public.is_org_member(v_match.organization_id, auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_match.status <> 'completed' then
    raise exception 'only completed match results can be edited' using errcode = '23514';
  end if;

  select score_mode_enabled into v_score_mode_enabled
  from public.organizations
  where id = v_match.organization_id
  for share;

  v_result := public.normalized_match_result(
    v_score_mode_enabled,
    p_result_mode,
    p_team_one_score,
    p_team_two_score,
    p_winning_team
  );

  insert into public.match_scores (
    match_id,
    result_mode,
    team_one_score,
    team_two_score,
    winning_team,
    reported_by
  )
  values (
    p_match_id,
    v_result ->> 'result_mode',
    (v_result ->> 'team_one_score')::integer,
    (v_result ->> 'team_two_score')::integer,
    (v_result ->> 'winning_team')::integer,
    auth.uid()
  )
  returning * into v_score;

  return jsonb_build_object(
    'match_id', v_score.match_id,
    'result_mode', v_score.result_mode,
    'team_one_score', v_score.team_one_score,
    'team_two_score', v_score.team_two_score,
    'winning_team', v_score.winning_team
  );
end;
$$;

revoke all on function public.update_completed_match_result(uuid, text, integer, integer, integer)
from public, anon, authenticated;

grant execute on function public.update_completed_match_result(uuid, text, integer, integer, integer)
to authenticated;

create or replace function public.update_completed_match_score(
  p_match_id uuid,
  p_team_one_score integer,
  p_team_two_score integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_score_mode_enabled boolean;
  v_winning_team integer;
begin
  if p_team_one_score is null or p_team_two_score is null then
    raise exception 'both scores are required' using errcode = '23514';
  end if;

  if p_team_one_score = p_team_two_score then
    raise exception 'scores cannot be tied' using errcode = '23514';
  end if;

  select o.score_mode_enabled into v_score_mode_enabled
  from public.matches m
  join public.organizations o on o.id = m.organization_id
  where m.id = p_match_id;

  if v_score_mode_enabled then
    return public.update_completed_match_result(
      p_match_id,
      'score',
      p_team_one_score,
      p_team_two_score,
      null
    );
  end if;

  v_winning_team := case when p_team_one_score > p_team_two_score then 1 else 2 end;

  return public.update_completed_match_result(
    p_match_id,
    'win_loss',
    null,
    null,
    v_winning_team
  );
end;
$$;

create or replace function public.set_organization_score_mode(
  p_organization_id uuid,
  p_score_mode_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization public.organizations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not public.is_org_admin(p_organization_id, auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_score_mode_enabled is null then
    raise exception 'score mode is required' using errcode = '23514';
  end if;

  update public.organizations
  set score_mode_enabled = p_score_mode_enabled,
      updated_at = now()
  where id = p_organization_id
  returning * into v_organization;

  if not found then
    raise exception 'organization % not found', p_organization_id using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', v_organization.id,
    'name', v_organization.name,
    'slug', v_organization.slug,
    'number_of_courts', v_organization.number_of_courts,
    'location_text', v_organization.location_text,
    'score_mode_enabled', v_organization.score_mode_enabled,
    'role', 'admin'
  );
end;
$$;

revoke all on function public.set_organization_score_mode(uuid, boolean)
from public, anon, authenticated;

grant execute on function public.set_organization_score_mode(uuid, boolean)
to authenticated;

create or replace function public.update_organization_settings(
  p_organization_id uuid,
  p_name text,
  p_slug text,
  p_number_of_courts integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := nullif(trim(p_name), '');
  v_slug text := nullif(
    regexp_replace(
      regexp_replace(lower(trim(p_slug)), '[^a-z0-9]+', '-', 'g'),
      '(^-+|-+$)',
      '',
      'g'
    ),
    ''
  );
  v_organization public.organizations%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not public.is_org_admin(p_organization_id, v_user_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_name is null then
    raise exception 'organization name cannot be empty' using errcode = '23514';
  end if;

  if v_slug is null then
    raise exception 'organization slug cannot be empty' using errcode = '23514';
  end if;

  if p_number_of_courts is null or p_number_of_courts < 1 then
    raise exception 'number_of_courts must be at least 1' using errcode = '23514';
  end if;

  update public.organizations
  set name = v_name,
      slug = v_slug,
      number_of_courts = p_number_of_courts,
      updated_at = now()
  where id = p_organization_id
  returning * into v_organization;

  if not found then
    raise exception 'organization % not found', p_organization_id using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', v_organization.id,
    'name', v_organization.name,
    'slug', v_organization.slug,
    'number_of_courts', v_organization.number_of_courts,
    'location_text', v_organization.location_text,
    'score_mode_enabled', v_organization.score_mode_enabled,
    'role', 'admin'
  );
end;
$$;

create or replace function public.create_league(
  p_name text,
  p_slug text,
  p_number_of_courts integer,
  p_location_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := nullif(trim(p_name), '');
  v_base_slug text := public.normalize_league_slug(coalesce(p_slug, p_name));
  v_slug text;
  v_organization public.organizations%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if v_name is null then
    raise exception 'league name cannot be empty' using errcode = '23514';
  end if;

  if p_number_of_courts is null or p_number_of_courts < 1 then
    raise exception 'number_of_courts must be at least 1' using errcode = '23514';
  end if;

  if v_base_slug is null then
    v_base_slug = lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  end if;

  v_slug = v_base_slug;
  while exists (select 1 from public.organizations where slug = v_slug) loop
    v_slug = v_base_slug || '-' || lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  end loop;

  insert into public.organizations (
    name,
    slug,
    number_of_courts,
    created_by,
    location_text
  )
  values (
    v_name,
    v_slug,
    p_number_of_courts,
    v_user_id,
    nullif(trim(p_location_text), '')
  )
  returning * into v_organization;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_organization.id, v_user_id, 'admin');

  perform public.ensure_current_user_player(v_organization.id);

  return jsonb_build_object(
    'id', v_organization.id,
    'name', v_organization.name,
    'slug', v_organization.slug,
    'number_of_courts', v_organization.number_of_courts,
    'role', 'admin',
    'location_text', v_organization.location_text,
    'score_mode_enabled', v_organization.score_mode_enabled
  );
end;
$$;

create or replace function public.my_organizations()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'name', o.name,
          'slug', o.slug,
          'number_of_courts', o.number_of_courts,
          'role', om.role,
          'location_text', o.location_text,
          'score_mode_enabled', o.score_mode_enabled
        )
        order by o.name
      )
      from public.organization_members om
      join public.organizations o on o.id = om.organization_id
      where om.user_id = v_user_id
    ),
    '[]'::jsonb
  );
end;
$$;

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
      'current_round', v_session.current_round
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

create or replace function public.completed_matches(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_session public.play_sessions%rowtype;
begin
  select * into v_session
  from public.play_sessions
  where id = p_session_id;

  if not found then
    raise exception 'play session % not found', p_session_id using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'session_id', p_session_id,
    'matches', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'court_number', m.court_number,
            'started_at', m.started_at,
            'completed_at', m.completed_at,
            'result_mode', ms.result_mode,
            'team_one_score', ms.team_one_score,
            'team_two_score', ms.team_two_score,
            'winning_team', ms.winning_team,
            'players', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'player_id', p.id,
                    'team_number', mp.team_number,
                    'slot_number', mp.slot_number,
                    'name', p.display_name,
                    'skill', p.rating,
                    'profile_image_path', p.profile_image_path
                  )
                  order by mp.team_number, mp.slot_number
                )
                from public.match_players mp
                join public.players p on p.id = mp.player_id
                where mp.match_id = m.id
              ),
              '[]'::jsonb
            )
          )
          order by m.completed_at desc nulls last, m.started_at desc
        )
        from public.matches m
        left join lateral (
          select result_mode, team_one_score, team_two_score, winning_team
          from public.match_scores
          where match_id = m.id
          order by created_at desc, id desc
          limit 1
        ) ms on true
        where m.session_id = p_session_id
          and m.status = 'completed'
      ),
      '[]'::jsonb
    )
  );
end;
$$;

grant execute on function public.set_organization_score_mode(uuid, boolean) to authenticated;
