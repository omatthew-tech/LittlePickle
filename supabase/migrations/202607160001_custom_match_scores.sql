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
  if p_team_one_score < 0 or p_team_two_score < 0 then
    raise exception 'scores cannot be negative' using errcode = '23514';
  end if;

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
    'snapshot', public.complete_match_for_recommendations(
      v_match_id,
      p_team_one_score,
      p_team_two_score
    )
  );
end;
$$;

revoke execute on function public.complete_custom_match_for_recommendations(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  integer
) from public;

grant execute on function public.complete_custom_match_for_recommendations(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  integer
) to authenticated;
