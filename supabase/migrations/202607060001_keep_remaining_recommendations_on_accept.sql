create or replace function public.accept_recommendation(
  p_recommendation_id uuid,
  p_court_number integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recommendation public.match_recommendations%rowtype;
  v_session public.play_sessions%rowtype;
  v_court_number integer;
  v_match_id uuid;
begin
  select * into v_recommendation
  from public.match_recommendations
  where id = p_recommendation_id
  for update;

  if not found then
    raise exception 'recommendation % not found', p_recommendation_id using errcode = 'P0002';
  end if;

  select * into v_session
  from public.play_sessions
  where id = v_recommendation.session_id
  for update;

  if not public.is_org_member(v_session.organization_id, auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_session.status <> 'open' then
    raise exception 'play session is not open' using errcode = '23514';
  end if;

  if v_recommendation.status <> 'pending' then
    raise exception 'recommendation is not pending' using errcode = '23514';
  end if;

  if p_court_number is not null and (
    p_court_number < 1 or p_court_number > v_session.court_count_snapshot
  ) then
    raise exception 'court number is outside this session court count' using errcode = '23514';
  end if;

  if p_court_number is not null and exists (
    select 1
    from public.matches m
    where m.session_id = v_session.id
      and m.status = 'active'
      and m.court_number = p_court_number
  ) then
    raise exception 'court % is already active', p_court_number using errcode = '23514';
  end if;

  if p_court_number is null and v_recommendation.court_number is not null and (
    v_recommendation.court_number < 1 or v_recommendation.court_number > v_session.court_count_snapshot
  ) then
    raise exception 'recommendation court is outside this session court count' using errcode = '23514';
  end if;

  if p_court_number is null and v_recommendation.court_number is not null and exists (
    select 1
    from public.matches m
    where m.session_id = v_session.id
      and m.status = 'active'
      and m.court_number = v_recommendation.court_number
  ) then
    raise exception 'court % is already active', v_recommendation.court_number using errcode = '23514';
  end if;

  select candidate.court_number into v_court_number
  from generate_series(1, v_session.court_count_snapshot) as candidate(court_number)
  where candidate.court_number = coalesce(p_court_number, v_recommendation.court_number, candidate.court_number)
    and not exists (
      select 1
      from public.matches m
      where m.session_id = v_session.id
        and m.status = 'active'
        and m.court_number = candidate.court_number
    )
  order by candidate.court_number
  limit 1;

  if v_court_number is null then
    raise exception 'no open courts are available' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.recommendation_players rp
    where rp.recommendation_id = p_recommendation_id
      and exists (
        select 1
        from public.matches m
        join public.match_players mp on mp.match_id = m.id
        where m.session_id = v_session.id
          and m.status = 'active'
          and mp.player_id = rp.player_id
      )
  ) then
    raise exception 'one or more players are already in an active match' using errcode = '23514';
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
    v_session.id,
    p_recommendation_id,
    v_court_number,
    'active'
  )
  returning id into v_match_id;

  insert into public.match_players (match_id, player_id, team_number, slot_number)
  select v_match_id, player_id, team_number, slot_number
  from public.recommendation_players
  where recommendation_id = p_recommendation_id;

  update public.match_recommendations
  set status = 'accepted'
  where id = p_recommendation_id
    and status = 'pending';

  return v_match_id;
end;
$$;

grant execute on function public.accept_recommendation(uuid, integer) to authenticated;
