-- Players are shared court identities, not auth-user-owned records. Multiple
-- devices may select and manage the same player without claiming that player.

create or replace function public.ensure_current_user_player(p_organization_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_player_id uuid;
  v_display_name text;
  v_avatar_path text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not public.is_org_member(p_organization_id, v_user_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select coalesce(public.user_display_name(v_user_id), 'Player')
  into v_display_name;

  select avatar_path into v_avatar_path
  from public.profiles
  where id = v_user_id;

  select id into v_player_id
  from public.players
  where organization_id = p_organization_id
    and active
    and lower(trim(display_name)) = lower(trim(v_display_name))
  order by created_at
  limit 1;

  if v_player_id is null then
    insert into public.players (
      organization_id,
      display_name,
      rating,
      profile_image_path,
      active
    )
    values (
      p_organization_id,
      v_display_name,
      3.00,
      v_avatar_path,
      true
    )
    returning id into v_player_id;
  end if;

  return v_player_id;
end;
$$;

create or replace function public.create_player(
  p_organization_id uuid,
  p_display_name text,
  p_rating numeric default 3.00,
  p_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text := nullif(trim(p_display_name), '');
  v_player_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not public.is_org_member(p_organization_id, v_user_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_display_name is null then
    raise exception 'display name cannot be empty' using errcode = '23514';
  end if;

  if p_rating is null or p_rating <= 0 then
    raise exception 'rating must be positive' using errcode = '23514';
  end if;

  insert into public.players (
    organization_id,
    display_name,
    rating
  )
  values (
    p_organization_id,
    v_display_name,
    p_rating
  )
  returning id into v_player_id;

  return v_player_id;
end;
$$;

create or replace function public.league_player_name_matches(
  p_organization_id uuid,
  p_query text
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
begin
  if not exists (
    select 1
    from public.organizations
    where id = p_organization_id
  ) then
    raise exception 'league % not found', p_organization_id using errcode = 'P0002';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'display_name', p.display_name,
          'rating', p.rating,
          'profile_image_path', p.profile_image_path,
          'created_at', p.created_at
        )
        order by p.display_name, p.created_at
      )
      from (
        select *
        from public.players
        where organization_id = p_organization_id
          and active
          and (
            v_query = ''
            or lower(display_name) like '%' || v_query || '%'
          )
        order by display_name, created_at
        limit 100
      ) p
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.join_league_queue(
  p_organization_id uuid,
  p_display_name text,
  p_player_id uuid default null,
  p_profile_image_path text default null,
  p_allow_duplicate_name boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text := nullif(trim(p_display_name), '');
  v_organization public.organizations%rowtype;
  v_player public.players%rowtype;
  v_session_id uuid;
  v_duplicate_count integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_organization
  from public.organizations
  where id = p_organization_id;

  if not found then
    raise exception 'league % not found', p_organization_id using errcode = 'P0002';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (p_organization_id, v_user_id, 'player')
  on conflict (organization_id, user_id)
  do update set role = public.organization_members.role;

  if p_player_id is not null then
    select * into v_player
    from public.players
    where id = p_player_id
      and organization_id = p_organization_id
      and active
    for update;

    if not found then
      raise exception 'player % not found in this league', p_player_id using errcode = 'P0002';
    end if;

    v_display_name = coalesce(v_display_name, v_player.display_name);

    update public.players
    set display_name = v_display_name,
        profile_image_path = coalesce(p_profile_image_path, profile_image_path),
        active = true
    where id = p_player_id
    returning * into v_player;
  else
    if v_display_name is null then
      raise exception 'first and last name are required' using errcode = '23514';
    end if;

    select count(*) into v_duplicate_count
    from public.players
    where organization_id = p_organization_id
      and active
      and lower(trim(display_name)) = lower(v_display_name);

    if v_duplicate_count > 0 and not p_allow_duplicate_name then
      raise exception 'that name already exists in this league; choose the existing player or confirm this is a different person' using errcode = '23514';
    end if;

    insert into public.players (
      organization_id,
      display_name,
      rating,
      profile_image_path,
      active
    )
    values (
      p_organization_id,
      v_display_name,
      3.00,
      p_profile_image_path,
      true
    )
    returning * into v_player;
  end if;

  v_session_id = public.get_or_create_open_play_session(p_organization_id, v_organization.number_of_courts);
  perform public.add_player_to_session(v_session_id, v_player.id);

  return jsonb_build_object(
    'organization', jsonb_build_object(
      'id', v_organization.id,
      'name', v_organization.name,
      'slug', v_organization.slug,
      'number_of_courts', v_organization.number_of_courts,
      'location_text', v_organization.location_text
    ),
    'player', jsonb_build_object(
      'id', v_player.id,
      'display_name', v_player.display_name,
      'rating', v_player.rating,
      'profile_image_path', v_player.profile_image_path
    ),
    'session_id', v_session_id
  );
end;
$$;

create or replace function public.update_player_display_name(
  p_player_id uuid,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text := nullif(trim(regexp_replace(coalesce(p_display_name, ''), '[[:space:]]+', ' ', 'g')), '');
  v_player public.players%rowtype;
  v_duplicate_count integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if v_display_name is null then
    raise exception 'display name cannot be empty' using errcode = '23514';
  end if;

  if array_length(regexp_split_to_array(v_display_name, '[[:space:]]+'), 1) < 2 then
    raise exception 'first and last name are required' using errcode = '23514';
  end if;

  select * into v_player
  from public.players
  where id = p_player_id
    and active
  for update;

  if not found then
    raise exception 'active player % not found', p_player_id using errcode = 'P0002';
  end if;

  select count(*) into v_duplicate_count
  from public.players
  where organization_id = v_player.organization_id
    and active
    and id <> p_player_id
    and lower(trim(display_name)) = lower(v_display_name);

  if v_duplicate_count > 0 then
    raise exception 'that player already exists in this league' using errcode = '23514';
  end if;

  update public.players
  set display_name = v_display_name
  where id = p_player_id
  returning * into v_player;

  return jsonb_build_object(
    'id', v_player.id,
    'display_name', v_player.display_name,
    'rating', v_player.rating,
    'profile_image_path', v_player.profile_image_path,
    'created_at', v_player.created_at
  );
end;
$$;

create or replace function public.update_player_profile_image(
  p_player_id uuid,
  p_profile_image_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile_image_path text := nullif(trim(coalesce(p_profile_image_path, '')), '');
  v_player public.players%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if v_profile_image_path is null then
    raise exception 'profile image path cannot be empty' using errcode = '23514';
  end if;

  if split_part(v_profile_image_path, '/', 1) <> v_user_id::text then
    raise exception 'profile image path does not belong to the current user' using errcode = '42501';
  end if;

  select * into v_player
  from public.players
  where id = p_player_id
    and active
  for update;

  if not found then
    raise exception 'active player % not found', p_player_id using errcode = 'P0002';
  end if;

  update public.players
  set profile_image_path = v_profile_image_path
  where id = p_player_id
  returning * into v_player;

  return jsonb_build_object(
    'id', v_player.id,
    'display_name', v_player.display_name,
    'rating', v_player.rating,
    'profile_image_path', v_player.profile_image_path,
    'created_at', v_player.created_at
  );
end;
$$;

-- Remove all historical claims and make the unowned invariant enforceable even
-- if an older client or RPC attempts to write an auth user onto a player.
update public.players
set user_id = null
where user_id is not null;

alter table public.players
drop constraint if exists players_user_id_must_be_null;

alter table public.players
add constraint players_user_id_must_be_null
check (user_id is null);

comment on column public.players.user_id is
  'Deprecated compatibility column. Players are shared and never linked to auth users.';

grant execute on function public.ensure_current_user_player(uuid) to authenticated;
grant execute on function public.create_player(uuid, text, numeric, uuid) to authenticated;
grant execute on function public.league_player_name_matches(uuid, text) to anon, authenticated;
grant execute on function public.join_league_queue(uuid, text, uuid, text, boolean) to authenticated;
grant execute on function public.update_player_display_name(uuid, text) to authenticated;
grant execute on function public.update_player_profile_image(uuid, text) to authenticated;
