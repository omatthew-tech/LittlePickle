create extension if not exists pgcrypto;

create type public.organization_role as enum ('admin', 'player');
create type public.play_session_status as enum ('open', 'closed');
create type public.session_player_status as enum ('active', 'inactive');
create type public.match_status as enum ('active', 'completed', 'cancelled');
create type public.recommendation_batch_status as enum ('active', 'superseded');
create type public.recommendation_status as enum ('pending', 'accepted', 'passed', 'superseded');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  number_of_courts integer not null check (number_of_courts > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null default 'player',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  rating numeric(4, 2) not null default 3.00 check (rating > 0),
  profile_image_path text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.play_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  court_count_snapshot integer not null check (court_count_snapshot > 0),
  status public.play_session_status not null default 'open',
  current_round integer not null default 0 check (current_round >= 0),
  created_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table public.session_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.play_sessions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  queue_position integer not null check (queue_position >= 0),
  rounds_waiting integer not null default 0 check (rounds_waiting >= 0),
  games_played integer not null default 0 check (games_played >= 0),
  status public.session_player_status not null default 'active',
  joined_at timestamptz not null default now(),
  unique (session_id, player_id)
);

create table public.recommendation_batches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.play_sessions(id) on delete cascade,
  generated_after_match_id uuid,
  algorithm_version text not null,
  status public.recommendation_batch_status not null default 'active',
  created_at timestamptz not null default now()
);

create table public.match_recommendations (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.recommendation_batches(id) on delete cascade,
  session_id uuid not null references public.play_sessions(id) on delete cascade,
  rank integer not null check (rank > 0),
  court_number integer,
  quality_score numeric(8, 4) not null,
  team_average_skill_difference numeric(8, 4) not null,
  player_skill_spread numeric(8, 4) not null,
  predicted_team_one_win_probability numeric(8, 6) not null,
  status public.recommendation_status not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (batch_id, rank)
);

create table public.recommendation_players (
  recommendation_id uuid not null references public.match_recommendations(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  team_number integer not null check (team_number in (1, 2)),
  slot_number integer not null check (slot_number in (1, 2)),
  primary key (recommendation_id, player_id),
  unique (recommendation_id, team_number, slot_number)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.play_sessions(id) on delete cascade,
  recommendation_id uuid references public.match_recommendations(id) on delete set null,
  court_number integer,
  status public.match_status not null default 'active',
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  team_number integer not null check (team_number in (1, 2)),
  slot_number integer not null check (slot_number in (1, 2)),
  primary key (match_id, player_id),
  unique (match_id, team_number, slot_number)
);

create table public.match_scores (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_one_score integer not null check (team_one_score >= 0),
  team_two_score integer not null check (team_two_score >= 0),
  reported_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.pass_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.play_sessions(id) on delete cascade,
  recommendation_id uuid references public.match_recommendations(id) on delete set null,
  player_id uuid not null references public.players(id) on delete cascade,
  passed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index profiles_display_name_idx on public.profiles (display_name);
create index organization_members_user_idx on public.organization_members (user_id);
create index players_organization_idx on public.players (organization_id, active);
create index play_sessions_organization_idx on public.play_sessions (organization_id, status);
create index session_players_session_status_idx on public.session_players (session_id, status, queue_position);
create unique index session_players_active_queue_position_key
on public.session_players (session_id, queue_position)
where status = 'active';
create index recommendation_batches_session_status_idx on public.recommendation_batches (session_id, status, created_at desc);
create index match_recommendations_session_status_idx on public.match_recommendations (session_id, status, rank);
create index matches_session_status_idx on public.matches (session_id, status);
create index matches_organization_status_idx on public.matches (organization_id, status);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-pictures',
  'profile-pictures',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create trigger organizations_touch_updated_at
before update on public.organizations
for each row execute function public.touch_updated_at();

create trigger players_touch_updated_at
before update on public.players
for each row execute function public.touch_updated_at();

create or replace function public.is_org_member(p_organization_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = p_user_id
  );
$$;

create or replace function public.is_org_admin(p_organization_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = p_user_id
      and om.role = 'admin'
  );
$$;

create or replace function public.user_display_name(p_user_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    nullif(trim(p.display_name), ''),
    nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(u.email, '@', 1), ''),
    'Player'
  )
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user_id;
$$;

create or replace function public.my_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select email into v_email
  from auth.users
  where id = v_user_id;

  return jsonb_build_object(
    'id', v_user_id,
    'email', v_email,
    'display_name', public.user_display_name(v_user_id),
    'avatar_path', (
      select avatar_path
      from public.profiles
      where id = v_user_id
    )
  );
end;
$$;

create or replace function public.update_my_profile(
  p_display_name text,
  p_avatar_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text := nullif(trim(p_display_name), '');
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if v_display_name is null then
    raise exception 'display name cannot be empty' using errcode = '23514';
  end if;

  insert into public.profiles (id, display_name, avatar_path)
  values (v_user_id, v_display_name, p_avatar_path)
  on conflict (id)
  do update
  set display_name = excluded.display_name,
      avatar_path = coalesce(excluded.avatar_path, public.profiles.avatar_path);

  update public.players
  set display_name = v_display_name,
      profile_image_path = coalesce(p_avatar_path, profile_image_path)
  where user_id = v_user_id;

  return public.my_profile();
end;
$$;

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

  select public.user_display_name(v_user_id) into v_display_name;

  select avatar_path into v_avatar_path
  from public.profiles
  where id = v_user_id;

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
    coalesce(v_display_name, 'Player'),
    3.00,
    v_avatar_path,
    true
  )
  on conflict (organization_id, user_id)
  do update
  set display_name = excluded.display_name,
      profile_image_path = coalesce(excluded.profile_image_path, public.players.profile_image_path),
      active = true
  returning id into v_player_id;

  return v_player_id;
end;
$$;

create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_number_of_courts integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_number_of_courts is null or p_number_of_courts < 1 then
    raise exception 'number_of_courts must be at least 1' using errcode = '23514';
  end if;

  insert into public.organizations (name, slug, number_of_courts, created_by)
  values (p_name, p_slug, p_number_of_courts, v_user_id)
  returning id into v_organization_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_organization_id, v_user_id, 'admin');

  perform public.ensure_current_user_player(v_organization_id);

  return v_organization_id;
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
          'role', om.role
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
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

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
        select o.id, o.name, o.slug, o.number_of_courts
        from public.organizations o
        where lower(o.name) like '%' || v_query || '%'
           or lower(o.slug) like '%' || v_query || '%'
        order by o.name
        limit 20
      ) matched_organizations
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.join_organization(p_organization_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organizations
    where id = p_organization_id
  ) then
    raise exception 'organization % not found', p_organization_id using errcode = 'P0002';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (p_organization_id, v_user_id, 'player')
  on conflict (organization_id, user_id)
  do update set role = public.organization_members.role;

  perform public.ensure_current_user_player(p_organization_id);

  return p_organization_id;
end;
$$;

create or replace function public.organization_members_for_admin(p_organization_id uuid)
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

  if not public.is_org_admin(p_organization_id, v_user_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'user_id', om.user_id,
          'role', om.role,
          'display_name', public.user_display_name(om.user_id),
          'email', u.email,
          'player_id', p.id,
          'player_name', p.display_name,
          'rating', p.rating,
          'created_at', om.created_at
        )
        order by
          case when om.role = 'admin' then 0 else 1 end,
          public.user_display_name(om.user_id)
      )
      from public.organization_members om
      join auth.users u on u.id = om.user_id
      left join public.players p
        on p.organization_id = om.organization_id
       and p.user_id = om.user_id
      where om.organization_id = p_organization_id
    ),
    '[]'::jsonb
  );
end;
$$;

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
      number_of_courts = p_number_of_courts
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
    'role', 'admin'
  );
end;
$$;

create or replace function public.set_organization_member_role(
  p_organization_id uuid,
  p_user_id uuid,
  p_role public.organization_role
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_role public.organization_role;
  v_admin_count integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not public.is_org_admin(p_organization_id, v_user_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_role is null then
    raise exception 'member role cannot be empty' using errcode = '23514';
  end if;

  if p_user_id = v_user_id and p_role <> 'admin' then
    raise exception 'another admin must change your admin role' using errcode = '23514';
  end if;

  select role into v_current_role
  from public.organization_members
  where organization_id = p_organization_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'member % not found in organization %', p_user_id, p_organization_id using errcode = 'P0002';
  end if;

  if v_current_role = 'admin' and p_role <> 'admin' then
    select count(*) into v_admin_count
    from public.organization_members
    where organization_id = p_organization_id
      and role = 'admin';

    if v_admin_count <= 1 then
      raise exception 'organization needs at least one admin' using errcode = '23514';
    end if;
  end if;

  update public.organization_members
  set role = p_role
  where organization_id = p_organization_id
    and user_id = p_user_id;

  return public.organization_members_for_admin(p_organization_id);
end;
$$;

create or replace function public.organization_players_for_admin(p_organization_id uuid)
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

  if not public.is_org_admin(p_organization_id, v_user_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'user_id', p.user_id,
          'display_name', p.display_name,
          'rating', p.rating,
          'profile_image_path', p.profile_image_path,
          'active', p.active,
          'created_at', p.created_at
        )
        order by p.active desc, p.display_name
      )
      from public.players p
      where p.organization_id = p_organization_id
    ),
    '[]'::jsonb
  );
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

  if p_user_id is distinct from v_user_id and not public.is_org_admin(p_organization_id, v_user_id) then
    raise exception 'only admins can create players for other users' using errcode = '42501';
  end if;

  if v_display_name is null then
    raise exception 'display name cannot be empty' using errcode = '23514';
  end if;

  if p_rating is null or p_rating <= 0 then
    raise exception 'rating must be positive' using errcode = '23514';
  end if;

  insert into public.players (
    organization_id,
    user_id,
    display_name,
    rating
  )
  values (
    p_organization_id,
    p_user_id,
    v_display_name,
    p_rating
  )
  on conflict (organization_id, user_id)
  do update
  set display_name = excluded.display_name,
      rating = excluded.rating,
      active = true
  returning id into v_player_id;

  return v_player_id;
end;
$$;

create or replace function public.update_organization_player(
  p_player_id uuid,
  p_display_name text,
  p_rating numeric,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_player public.players%rowtype;
  v_display_name text := nullif(trim(p_display_name), '');
  v_session_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_player
  from public.players
  where id = p_player_id
  for update;

  if not found then
    raise exception 'player % not found', p_player_id using errcode = 'P0002';
  end if;

  if not public.is_org_admin(v_player.organization_id, v_user_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_display_name is null then
    raise exception 'display name cannot be empty' using errcode = '23514';
  end if;

  if p_rating is null or p_rating <= 0 then
    raise exception 'rating must be positive' using errcode = '23514';
  end if;

  if p_active is null then
    raise exception 'active cannot be empty' using errcode = '23514';
  end if;

  if p_active = false and exists (
    select 1
    from public.matches m
    join public.match_players mp on mp.match_id = m.id
    where m.organization_id = v_player.organization_id
      and m.status = 'active'
      and mp.player_id = p_player_id
  ) then
    raise exception 'player is in an active match' using errcode = '23514';
  end if;

  update public.players
  set display_name = v_display_name,
      rating = p_rating,
      active = p_active
  where id = p_player_id
  returning * into v_player;

  if p_active = false then
    for v_session_id in
      select distinct sp.session_id
      from public.session_players sp
      join public.play_sessions ps on ps.id = sp.session_id
      where sp.player_id = p_player_id
        and sp.status = 'active'
        and ps.status = 'open'
    loop
      update public.session_players
      set queue_position = queue_position + 1000000
      where session_id = v_session_id
        and status = 'active';

      update public.session_players
      set status = 'inactive'
      where session_id = v_session_id
        and player_id = p_player_id;

      with ordered as (
        select
          sp.id,
          row_number() over (order by sp.queue_position) - 1 as new_queue_position
        from public.session_players sp
        where sp.session_id = v_session_id
          and sp.status = 'active'
      )
      update public.session_players sp
      set queue_position = ordered.new_queue_position
      from ordered
      where sp.id = ordered.id;
    end loop;
  end if;

  return public.organization_players_for_admin(v_player.organization_id);
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

  select coalesce(p_court_count, number_of_courts)
  into v_court_count
  from public.organizations
  where id = p_organization_id;

  if v_court_count is null then
    raise exception 'organization % not found', p_organization_id using errcode = 'P0002';
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
  returning id into v_session_id;

  return v_session_id;
end;
$$;

create or replace function public.organization_open_sessions(p_organization_id uuid)
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

  if not public.is_org_member(p_organization_id, v_user_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', ps.id,
          'court_count_snapshot', ps.court_count_snapshot,
          'current_round', ps.current_round,
          'started_at', ps.started_at,
          'active_match_count', (
            select count(*)
            from public.matches m
            where m.session_id = ps.id
              and m.status = 'active'
          ),
          'active_player_count', (
            select count(*)
            from public.session_players sp
            where sp.session_id = ps.id
              and sp.status = 'active'
          )
        )
        order by ps.started_at desc
      )
      from public.play_sessions ps
      where ps.organization_id = p_organization_id
        and ps.status = 'open'
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.close_play_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.play_sessions%rowtype;
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

  if not public.is_org_member(v_session.organization_id, v_user_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_session.status = 'closed' then
    return jsonb_build_object(
      'id', v_session.id,
      'status', v_session.status,
      'ended_at', v_session.ended_at
    );
  end if;

  if exists (
    select 1
    from public.matches m
    where m.session_id = p_session_id
      and m.status = 'active'
  ) then
    raise exception 'complete active matches before closing this session' using errcode = '23514';
  end if;

  update public.play_sessions
  set status = 'closed',
      ended_at = now()
  where id = p_session_id
  returning * into v_session;

  update public.session_players
  set status = 'inactive'
  where session_id = p_session_id
    and status = 'active';

  update public.recommendation_batches
  set status = 'superseded'
  where session_id = p_session_id
    and status = 'active';

  update public.match_recommendations
  set status = 'superseded'
  where session_id = p_session_id
    and status = 'pending';

  return jsonb_build_object(
    'id', v_session.id,
    'status', v_session.status,
    'ended_at', v_session.ended_at
  );
end;
$$;

create or replace function public.add_player_to_session(
  p_session_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.play_sessions%rowtype;
  v_player public.players%rowtype;
  v_next_position integer;
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

  if not public.is_org_member(v_session.organization_id, auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_player
  from public.players
  where id = p_player_id
    and organization_id = v_session.organization_id
    and active;

  if not found then
    raise exception 'active player % not found in this organization', p_player_id using errcode = 'P0002';
  end if;

  select coalesce(max(queue_position) + 1, 0)
  into v_next_position
  from public.session_players
  where session_id = p_session_id
    and status = 'active';

  if exists (
    select 1
    from public.session_players
    where session_id = p_session_id
      and player_id = p_player_id
      and status = 'active'
  ) then
    return public.session_recommendation_snapshot(p_session_id);
  end if;

  insert into public.session_players (
    session_id,
    player_id,
    queue_position,
    rounds_waiting,
    games_played,
    status
  )
  values (
    p_session_id,
    p_player_id,
    v_next_position,
    0,
    0,
    'active'
  )
  on conflict (session_id, player_id)
  do update
  set status = 'active',
      queue_position = v_next_position,
      rounds_waiting = session_players.rounds_waiting,
      games_played = session_players.games_played;

  return public.session_recommendation_snapshot(p_session_id);
end;
$$;

create or replace function public.remove_player_from_session(
  p_session_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.play_sessions%rowtype;
  v_current_position integer;
begin
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

  select queue_position into v_current_position
  from public.session_players
  where session_id = p_session_id
    and player_id = p_player_id
    and status = 'active'
  for update;

  if not found then
    return public.session_recommendation_snapshot(p_session_id);
  end if;

  update public.session_players
  set queue_position = 1000000 + queue_position,
      status = 'inactive'
  where session_id = p_session_id
    and player_id = p_player_id;

  update public.session_players
  set queue_position = queue_position + 1000000
  where session_id = p_session_id
    and status = 'active'
    and queue_position > v_current_position;

  update public.session_players
  set queue_position = queue_position - 1000001
  where session_id = p_session_id
    and status = 'active'
    and queue_position >= 1000000;

  return public.session_recommendation_snapshot(p_session_id);
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

  if not public.is_org_member(v_session.organization_id, auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_organization
  from public.organizations
  where id = v_session.organization_id;

  return jsonb_build_object(
    'organization', jsonb_build_object(
      'id', v_organization.id,
      'number_of_courts', v_session.court_count_snapshot
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

create or replace function public.pass_player(
  p_session_id uuid,
  p_player_id uuid,
  p_recommendation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recommendation public.match_recommendations%rowtype;
  v_session public.play_sessions%rowtype;
  v_current_position integer;
  v_max_position integer;
begin
  if p_recommendation_id is not null then
    select * into v_recommendation
    from public.match_recommendations
    where id = p_recommendation_id
    for update;

    if not found then
      raise exception 'recommendation % not found', p_recommendation_id using errcode = 'P0002';
    end if;

    if v_recommendation.session_id <> p_session_id then
      raise exception 'recommendation is not part of this session' using errcode = '23514';
    end if;

    if v_recommendation.status <> 'pending' then
      raise exception 'recommendation is not pending' using errcode = '23514';
    end if;
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

  if p_recommendation_id is not null and not exists (
    select 1
    from public.recommendation_players rp
    where rp.recommendation_id = p_recommendation_id
      and rp.player_id = p_player_id
  ) then
    raise exception 'player is not part of recommendation' using errcode = '23514';
  end if;

  select queue_position into v_current_position
  from public.session_players
  where session_id = p_session_id
    and player_id = p_player_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'player is not active in this session' using errcode = 'P0002';
  end if;

  select max(queue_position) into v_max_position
  from public.session_players
  where session_id = p_session_id
    and status = 'active';

  update public.session_players
  set queue_position = queue_position + 1000000
  where session_id = p_session_id
    and status = 'active';

  with ordered as (
    select
      sp.id,
      sp.player_id,
      sp.queue_position - 1000000 as original_position,
      case
        when sp.player_id = p_player_id then coalesce(v_max_position, 0)
        when sp.queue_position - 1000000 > v_current_position then sp.queue_position - 1000001
        else sp.queue_position - 1000000
      end as new_queue_position
    from public.session_players sp
    where sp.session_id = p_session_id
      and sp.status = 'active'
  )
  update public.session_players sp
  set queue_position = ordered.new_queue_position,
      rounds_waiting = case when ordered.player_id = p_player_id then 0 else sp.rounds_waiting end
  from ordered
  where sp.id = ordered.id;

  insert into public.pass_events (session_id, recommendation_id, player_id, passed_by)
  values (p_session_id, p_recommendation_id, p_player_id, auth.uid());

  if p_recommendation_id is not null then
    update public.match_recommendations
    set status = 'passed'
    where id = p_recommendation_id
      and status = 'pending';
  end if;

  return public.session_recommendation_snapshot(p_session_id);
end;
$$;

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
  set status = case when id = p_recommendation_id then 'accepted' else 'superseded' end
  where batch_id = v_recommendation.batch_id
    and status = 'pending';

  update public.recommendation_batches
  set status = 'superseded'
  where id = v_recommendation.batch_id;

  return v_match_id;
end;
$$;

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
  v_match public.matches%rowtype;
  v_session public.play_sessions%rowtype;
begin
  if p_team_one_score < 0 or p_team_two_score < 0 then
    raise exception 'scores cannot be negative' using errcode = '23514';
  end if;

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

  update public.matches
  set status = 'completed',
      completed_at = now()
  where id = p_match_id;

  insert into public.match_scores (match_id, team_one_score, team_two_score, reported_by)
  values (p_match_id, p_team_one_score, p_team_two_score, auth.uid());

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

create or replace function public.replace_recommendation_batch(
  p_session_id uuid,
  p_generated_after_match_id uuid,
  p_algorithm_version text,
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
    status
  )
  values (
    p_session_id,
    p_generated_after_match_id,
    p_algorithm_version,
    'active'
  )
  returning id into v_batch_id;

  for v_recommendation in
    select value
    from jsonb_array_elements(p_recommendations)
  loop
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
      nullif(v_recommendation ->> 'court_number', '')::integer,
      (v_recommendation ->> 'quality_score')::numeric,
      (v_recommendation ->> 'team_average_skill_difference')::numeric,
      (v_recommendation ->> 'player_skill_spread')::numeric,
      (v_recommendation ->> 'predicted_team_one_win_probability')::numeric,
      v_recommendation - 'players'
    )
    returning id into v_recommendation_id;

    v_recommendation_ids = v_recommendation_ids || jsonb_build_array(
      jsonb_build_object(
        'rank', (v_recommendation ->> 'rank')::integer,
        'id', v_recommendation_id
      )
    );

    for v_player in
      select value
      from jsonb_array_elements(v_recommendation -> 'players')
    loop
      insert into public.recommendation_players (
        recommendation_id,
        player_id,
        team_number,
        slot_number
      )
      values (
        v_recommendation_id,
        (v_player ->> 'player_id')::uuid,
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
begin
  select * into v_session
  from public.play_sessions
  where id = p_session_id;

  if not found then
    raise exception 'play session % not found', p_session_id using errcode = 'P0002';
  end if;

  if not public.is_org_member(v_session.organization_id, auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
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
      'recommendation_count', v_session.court_count_snapshot + 1,
      'batch_id', null,
      'recommendations', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'algorithm_version', v_batch.algorithm_version,
    'session_id', p_session_id,
    'recommendation_count', v_session.court_count_snapshot + 1,
    'batch_id', v_batch.id,
    'recommendations', coalesce(
      (
        select jsonb_agg(
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
        )
        from public.match_recommendations mr
        where mr.batch_id = v_batch.id
          and mr.status = 'pending'
      ),
      '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.active_matches(p_session_id uuid)
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

  if not public.is_org_member(v_session.organization_id, auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
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
          order by m.court_number nulls last, m.started_at
        )
        from public.matches m
        where m.session_id = p_session_id
          and m.status = 'active'
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

  if not public.is_org_member(v_session.organization_id, auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
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
            'team_one_score', ms.team_one_score,
            'team_two_score', ms.team_two_score,
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
          select team_one_score, team_two_score
          from public.match_scores
          where match_id = m.id
          order by created_at desc
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

create or replace function public.session_player_options(p_session_id uuid)
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

  if not public.is_org_member(v_session.organization_id, auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.display_name,
          'skill', p.rating,
          'profile_image_path', p.profile_image_path,
          'in_session', coalesce(sp.status = 'active', false),
          'is_playing', exists (
            select 1
            from public.matches m
            join public.match_players mp on mp.match_id = m.id
            where m.session_id = p_session_id
              and m.status = 'active'
              and mp.player_id = p.id
          ),
          'rounds_waiting', coalesce(sp.rounds_waiting, 0),
          'queue_position', sp.queue_position,
          'games_played', coalesce(sp.games_played, 0)
        )
        order by
          coalesce(sp.status = 'active', false) desc,
          sp.queue_position nulls last,
          p.display_name
      )
      from public.players p
      left join public.session_players sp
        on sp.session_id = p_session_id
       and sp.player_id = p.id
      where p.organization_id = v_session.organization_id
        and p.active
    ),
    '[]'::jsonb
  );
end;
$$;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.players enable row level security;
alter table public.play_sessions enable row level security;
alter table public.session_players enable row level security;
alter table public.recommendation_batches enable row level security;
alter table public.match_recommendations enable row level security;
alter table public.recommendation_players enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.match_scores enable row level security;
alter table public.pass_events enable row level security;

create policy "profiles are visible to self" on public.profiles
for select using (id = auth.uid());

create policy "profiles are editable by self" on public.profiles
for all using (id = auth.uid()) with check (id = auth.uid());

create policy "authenticated users can create organizations" on public.organizations
for insert with check (created_by = auth.uid());

create policy "members can read organizations" on public.organizations
for select using (public.is_org_member(id));

create policy "admins can update organizations" on public.organizations
for update using (public.is_org_admin(id)) with check (public.is_org_admin(id));

create policy "members can read organization members" on public.organization_members
for select using (public.is_org_member(organization_id));

create policy "admins can manage organization members" on public.organization_members
for all using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

create policy "members can read players" on public.players
for select using (public.is_org_member(organization_id));

create policy "admins can manage players" on public.players
for all using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

create policy "members can read sessions" on public.play_sessions
for select using (public.is_org_member(organization_id));

create policy "members can create sessions" on public.play_sessions
for insert with check (public.is_org_member(organization_id));

create policy "admins can update sessions" on public.play_sessions
for update using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

create policy "members can read session players" on public.session_players
for select using (
  exists (
    select 1
    from public.play_sessions ps
    where ps.id = session_players.session_id
      and public.is_org_member(ps.organization_id)
  )
);

create policy "admins can manage session players" on public.session_players
for all using (
  exists (
    select 1
    from public.play_sessions ps
    where ps.id = session_players.session_id
      and public.is_org_admin(ps.organization_id)
  )
) with check (
  exists (
    select 1
    from public.play_sessions ps
    where ps.id = session_players.session_id
      and public.is_org_admin(ps.organization_id)
  )
);

create policy "members can read recommendation batches" on public.recommendation_batches
for select using (
  exists (
    select 1
    from public.play_sessions ps
    where ps.id = recommendation_batches.session_id
      and public.is_org_member(ps.organization_id)
  )
);

create policy "members can read match recommendations" on public.match_recommendations
for select using (
  exists (
    select 1
    from public.play_sessions ps
    where ps.id = match_recommendations.session_id
      and public.is_org_member(ps.organization_id)
  )
);

create policy "members can read recommendation players" on public.recommendation_players
for select using (
  exists (
    select 1
    from public.match_recommendations mr
    join public.play_sessions ps on ps.id = mr.session_id
    where mr.id = recommendation_players.recommendation_id
      and public.is_org_member(ps.organization_id)
  )
);

create policy "members can read matches" on public.matches
for select using (public.is_org_member(organization_id));

create policy "members can read match players" on public.match_players
for select using (
  exists (
    select 1
    from public.matches m
    where m.id = match_players.match_id
      and public.is_org_member(m.organization_id)
  )
);

create policy "members can read scores" on public.match_scores
for select using (
  exists (
    select 1
    from public.matches m
    where m.id = match_scores.match_id
      and public.is_org_member(m.organization_id)
  )
);

create policy "members can read pass events" on public.pass_events
for select using (
  exists (
    select 1
    from public.play_sessions ps
    where ps.id = pass_events.session_id
      and public.is_org_member(ps.organization_id)
  )
);

create policy "public can read profile pictures" on storage.objects
for select using (bucket_id = 'profile-pictures');

create policy "users can upload own profile pictures" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'profile-pictures'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users can update own profile pictures" on storage.objects
for update to authenticated
using (
  bucket_id = 'profile-pictures'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-pictures'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users can delete own profile pictures" on storage.objects
for delete to authenticated
using (
  bucket_id = 'profile-pictures'
  and (storage.foldername(name))[1] = auth.uid()::text
);

revoke execute on function public.replace_recommendation_batch(uuid, uuid, text, jsonb) from public;
grant execute on function public.replace_recommendation_batch(uuid, uuid, text, jsonb) to service_role;

grant execute on function public.session_recommendation_snapshot(uuid) to authenticated;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.update_my_profile(text, text) to authenticated;
grant execute on function public.ensure_current_user_player(uuid) to authenticated;
grant execute on function public.create_organization(text, text, integer) to authenticated;
grant execute on function public.my_organizations() to authenticated;
grant execute on function public.search_organizations(text) to authenticated;
grant execute on function public.join_organization(uuid) to authenticated;
grant execute on function public.organization_members_for_admin(uuid) to authenticated;
grant execute on function public.update_organization_settings(uuid, text, text, integer) to authenticated;
grant execute on function public.set_organization_member_role(uuid, uuid, public.organization_role) to authenticated;
grant execute on function public.organization_players_for_admin(uuid) to authenticated;
grant execute on function public.create_player(uuid, text, numeric, uuid) to authenticated;
grant execute on function public.update_organization_player(uuid, text, numeric, boolean) to authenticated;
grant execute on function public.create_play_session(uuid, integer) to authenticated;
grant execute on function public.organization_open_sessions(uuid) to authenticated;
grant execute on function public.close_play_session(uuid) to authenticated;
grant execute on function public.add_player_to_session(uuid, uuid) to authenticated;
grant execute on function public.remove_player_from_session(uuid, uuid) to authenticated;
grant execute on function public.active_recommendations(uuid) to authenticated;
grant execute on function public.active_matches(uuid) to authenticated;
grant execute on function public.completed_matches(uuid) to authenticated;
grant execute on function public.session_player_options(uuid) to authenticated;
grant execute on function public.pass_player(uuid, uuid, uuid) to authenticated;
grant execute on function public.accept_recommendation(uuid, integer) to authenticated;
grant execute on function public.complete_match_for_recommendations(uuid, integer, integer) to authenticated;
