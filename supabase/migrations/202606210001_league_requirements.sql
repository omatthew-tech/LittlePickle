alter table public.organizations
add column if not exists location_text text;

create unique index if not exists play_sessions_one_open_per_organization_key
on public.play_sessions (organization_id)
where status = 'open';

create or replace function public.normalize_league_slug(p_value text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(lower(trim(coalesce(p_value, ''))), '[^a-z0-9]+', '-', 'g'),
      '(^-+|-+$)',
      '',
      'g'
    ),
    ''
  );
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
    'location_text', v_organization.location_text
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
          'location_text', o.location_text
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

create or replace function public.search_organizations(p_query text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_query text := lower(trim(p_query));
begin
  if v_query = '' then
    return '[]'::jsonb;
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', matched_organizations.id,
          'name', matched_organizations.name,
          'slug', matched_organizations.slug,
          'number_of_courts', matched_organizations.number_of_courts,
          'location_text', matched_organizations.location_text,
          'already_member', exists (
            select 1
            from public.organization_members om
            where om.organization_id = matched_organizations.id
              and om.user_id = v_user_id
          )
        )
        order by matched_organizations.name
      )
      from (
        select o.id, o.name, o.slug, o.number_of_courts, o.location_text
        from public.organizations o
        where lower(o.name) like '%' || v_query || '%'
           or lower(o.slug) like '%' || v_query || '%'
           or lower(coalesce(o.location_text, '')) like '%' || v_query || '%'
        order by o.name
        limit 20
      ) matched_organizations
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.league_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_code text := lower(nullif(trim(p_code), ''));
  v_organization public.organizations%rowtype;
begin
  if v_code is null then
    raise exception 'league QR value cannot be empty' using errcode = '23514';
  end if;

  select * into v_organization
  from public.organizations o
  where lower(o.slug) = v_code
     or lower(o.id::text) = v_code
  limit 1;

  if not found then
    raise exception 'league QR not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', v_organization.id,
    'name', v_organization.name,
    'slug', v_organization.slug,
    'number_of_courts', v_organization.number_of_courts,
    'location_text', v_organization.location_text
  );
end;
$$;

create or replace function public.get_or_create_open_play_session(
  p_organization_id uuid,
  p_court_count integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_court_count integer;
  v_session_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not public.is_org_member(p_organization_id, v_user_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select id into v_session_id
  from public.play_sessions
  where organization_id = p_organization_id
    and status = 'open'
  order by started_at desc
  limit 1
  for update;

  if found then
    return v_session_id;
  end if;

  select coalesce(p_court_count, number_of_courts)
  into v_court_count
  from public.organizations
  where id = p_organization_id;

  if v_court_count is null then
    raise exception 'league % not found', p_organization_id using errcode = 'P0002';
  end if;

  if v_court_count < 1 then
    raise exception 'court count must be at least 1' using errcode = '23514';
  end if;

  insert into public.play_sessions (
    organization_id,
    court_count_snapshot,
    created_by
  )
  values (
    p_organization_id,
    v_court_count,
    v_user_id
  )
  on conflict do nothing
  returning id into v_session_id;

  if v_session_id is null then
    select id into v_session_id
    from public.play_sessions
    where organization_id = p_organization_id
      and status = 'open'
    order by started_at desc
    limit 1;
  end if;

  return v_session_id;
end;
$$;

create or replace function public.create_play_session(
  p_organization_id uuid,
  p_court_count integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.get_or_create_open_play_session(p_organization_id, p_court_count);
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
  v_query text := lower(trim(p_query));
begin
  if v_query = '' then
    return '[]'::jsonb;
  end if;

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
          'created_at', p.created_at,
          'has_account', p.user_id is not null
        )
        order by p.display_name, p.created_at
      )
      from public.players p
      where p.organization_id = p_organization_id
        and p.active
        and lower(p.display_name) like '%' || v_query || '%'
      limit 20
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
  v_player_id uuid;
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

    if v_player.user_id is not null and v_player.user_id <> v_user_id then
      raise exception 'that player name is already claimed; choose another match or add your name' using errcode = '23514';
    end if;

    v_display_name = coalesce(v_display_name, v_player.display_name);

    update public.players
    set user_id = v_user_id,
        display_name = v_display_name,
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
      and lower(trim(display_name)) = lower(v_display_name)
      and (user_id is null or user_id <> v_user_id);

    if v_duplicate_count > 0 and not p_allow_duplicate_name then
      raise exception 'that name already exists in this league; choose the existing player or confirm this is a different person' using errcode = '23514';
    end if;

    insert into public.players (
      organization_id,
      user_id,
      display_name,
      rating,
      profile_image_path,
      active
    )
    values (
      p_organization_id,
      v_user_id,
      v_display_name,
      3.00,
      p_profile_image_path,
      true
    )
    on conflict (organization_id, user_id)
    do update
    set display_name = excluded.display_name,
        profile_image_path = coalesce(excluded.profile_image_path, public.players.profile_image_path),
        active = true
    returning * into v_player;
  end if;

  insert into public.profiles (id, display_name, avatar_path)
  values (v_user_id, v_player.display_name, coalesce(p_profile_image_path, v_player.profile_image_path))
  on conflict (id)
  do update
  set display_name = excluded.display_name,
      avatar_path = coalesce(excluded.avatar_path, public.profiles.avatar_path);

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

grant execute on function public.create_league(text, text, integer, text) to authenticated;
grant execute on function public.search_organizations(text) to anon, authenticated;
grant execute on function public.league_by_code(text) to anon, authenticated;
grant execute on function public.get_or_create_open_play_session(uuid, integer) to authenticated;
grant execute on function public.league_player_name_matches(uuid, text) to anon, authenticated;
grant execute on function public.join_league_queue(uuid, text, uuid, text, boolean) to authenticated;
