create or replace function public.create_session_queued_player(
  p_session_id uuid,
  p_display_name text,
  p_rating numeric default 3.00
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text := nullif(trim(regexp_replace(coalesce(p_display_name, ''), '[[:space:]]+', ' ', 'g')), '');
  v_session public.play_sessions%rowtype;
  v_player_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

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

  if not public.is_org_member(v_session.organization_id, v_user_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_display_name is null then
    raise exception 'display name cannot be empty' using errcode = '23514';
  end if;

  if array_length(regexp_split_to_array(v_display_name, '[[:space:]]+'), 1) < 2 then
    raise exception 'first and last name are required' using errcode = '23514';
  end if;

  if p_rating is null or p_rating <= 0 then
    raise exception 'rating must be positive' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.players p
    where p.organization_id = v_session.organization_id
      and p.active
      and lower(trim(p.display_name)) = lower(v_display_name)
  ) then
    raise exception 'that player already exists in this league; add them from the player list' using errcode = '23514';
  end if;

  insert into public.players (
    organization_id,
    user_id,
    display_name,
    rating,
    active
  )
  values (
    v_session.organization_id,
    null,
    v_display_name,
    p_rating,
    true
  )
  returning id into v_player_id;

  perform public.add_player_to_session(p_session_id, v_player_id);

  return v_player_id;
end;
$$;

grant execute on function public.create_session_queued_player(uuid, text, numeric) to authenticated;
