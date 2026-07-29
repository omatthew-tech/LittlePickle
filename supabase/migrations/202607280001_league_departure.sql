-- Leaving a league is intentionally different from deleting shared player
-- data. Membership and queue visibility are removed immediately, while the
-- inactive player record (including rating and match history) is retained so
-- it can be restored if the player joins the league again later.

alter table public.organization_members
add column if not exists player_id uuid references public.players(id) on delete set null;

create index if not exists organization_members_player_idx
on public.organization_members (player_id)
where player_id is not null;

-- Best-effort backfill for memberships created before player selection was
-- stored explicitly. New joins and player switches keep this link exact.
update public.organization_members om
set player_id = (
  select p.id
  from public.players p
  left join public.profiles pr on pr.id = om.user_id
  where p.organization_id = om.organization_id
    and p.active
    and lower(trim(p.display_name)) = lower(trim(coalesce(pr.display_name, '')))
  order by
    case
      when pr.avatar_path is not null and p.profile_image_path = pr.avatar_path then 0
      else 1
    end,
    p.created_at
  limit 1
)
where om.player_id is null
  and exists (
    select 1
    from public.players p
    join public.profiles pr on pr.id = om.user_id
    where p.organization_id = om.organization_id
      and p.active
      and lower(trim(p.display_name)) = lower(trim(pr.display_name))
  );

create or replace function public.set_my_league_player(
  p_organization_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_player public.players%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organization_members
    where organization_id = p_organization_id
      and user_id = v_user_id
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_player
  from public.players
  where id = p_player_id
    and organization_id = p_organization_id
    and personal_data_deleted_at is null;

  if not found then
    raise exception 'player % not found in this league', p_player_id using errcode = 'P0002';
  end if;

  update public.organization_members
  set player_id = p_player_id
  where organization_id = p_organization_id
    and user_id = v_user_id;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'player_id', p_player_id
  );
end;
$$;

create or replace function public.hide_departed_league_player(
  p_organization_id uuid,
  p_player_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  update public.players
  set active = false,
      deactivated_at = now(),
      deletion_scheduled_at = null,
      deactivated_by = p_user_id,
      personal_data_deleted_at = null
  where id = p_player_id
    and organization_id = p_organization_id
    and personal_data_deleted_at is null;

  if not found then
    return;
  end if;

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
end;
$$;

create or replace function public.leave_my_league(
  p_organization_id uuid,
  p_player_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_member public.organization_members%rowtype;
  v_player_id uuid;
  v_player public.players%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_member
  from public.organization_members
  where organization_id = p_organization_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'you are not a member of this league' using errcode = 'P0002';
  end if;

  v_player_id = coalesce(p_player_id, v_member.player_id);

  if v_player_id is not null then
    select * into v_player
    from public.players
    where id = v_player_id
      and organization_id = p_organization_id
      and personal_data_deleted_at is null;

    if not found then
      raise exception 'player % not found in this league', v_player_id using errcode = 'P0002';
    end if;

    perform public.hide_departed_league_player(
      p_organization_id,
      v_player_id,
      v_user_id
    );
  end if;

  delete from public.organization_members
  where organization_id = p_organization_id
    and user_id = v_user_id;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'player_id', v_player_id,
    'rating', case when v_player_id is null then null else v_player.rating end
  );
end;
$$;

create or replace function public.leave_all_my_leagues()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_member record;
  v_left_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  for v_member in
    select
      om.organization_id,
      coalesce(
        om.player_id,
        (
          select p.id
          from public.players p
          left join public.profiles pr on pr.id = om.user_id
          where p.organization_id = om.organization_id
            and p.active
            and p.personal_data_deleted_at is null
            and lower(trim(p.display_name)) = lower(trim(coalesce(pr.display_name, '')))
          order by
            case
              when pr.avatar_path is not null and p.profile_image_path = pr.avatar_path then 0
              else 1
            end,
            p.created_at
          limit 1
        )
      ) as player_id
    from public.organization_members om
    where om.user_id = v_user_id
    for update
  loop
    if v_member.player_id is not null then
      perform public.hide_departed_league_player(
        v_member.organization_id,
        v_member.player_id,
        v_user_id
      );
    end if;

    delete from public.organization_members
    where organization_id = v_member.organization_id
      and user_id = v_user_id;

    v_left_count = v_left_count + 1;
  end loop;

  return v_left_count;
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
    select id into v_player_id
    from public.players
    where organization_id = p_organization_id
      and not active
      and deletion_scheduled_at is null
      and personal_data_deleted_at is null
      and lower(trim(display_name)) = lower(trim(v_display_name))
    order by deactivated_at desc nulls last, created_at
    limit 1
    for update;
  end if;

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
  else
    update public.players
    set active = true,
        profile_image_path = coalesce(profile_image_path, v_avatar_path),
        deactivated_at = null,
        deletion_scheduled_at = null,
        deactivated_by = null
    where id = v_player_id;
  end if;

  update public.organization_members
  set player_id = v_player_id
  where organization_id = p_organization_id
    and user_id = v_user_id;

  return v_player_id;
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

  if p_player_id is not null then
    select * into v_player
    from public.players
    where id = p_player_id
      and organization_id = p_organization_id
      and personal_data_deleted_at is null
      and (active or deletion_scheduled_at is null)
    for update;

    if not found then
      raise exception 'player % not found in this league', p_player_id using errcode = 'P0002';
    end if;

    v_display_name = coalesce(v_display_name, v_player.display_name);

    update public.players
    set display_name = v_display_name,
        profile_image_path = coalesce(p_profile_image_path, profile_image_path),
        active = true,
        deactivated_at = null,
        deletion_scheduled_at = null,
        deactivated_by = null
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

    if v_duplicate_count = 0 then
      select * into v_player
      from public.players
      where organization_id = p_organization_id
        and not active
        and deletion_scheduled_at is null
        and personal_data_deleted_at is null
        and lower(trim(display_name)) = lower(v_display_name)
      order by deactivated_at desc nulls last, created_at
      limit 1
      for update;
    end if;

    if v_player.id is not null then
      update public.players
      set display_name = v_display_name,
          profile_image_path = coalesce(p_profile_image_path, profile_image_path),
          active = true,
          deactivated_at = null,
          deletion_scheduled_at = null,
          deactivated_by = null
      where id = v_player.id
      returning * into v_player;
    else
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
  end if;

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    player_id
  )
  values (
    p_organization_id,
    v_user_id,
    'player',
    v_player.id
  )
  on conflict (organization_id, user_id)
  do update
  set role = public.organization_members.role,
      player_id = excluded.player_id;

  v_session_id = public.get_or_create_open_play_session(
    p_organization_id,
    v_organization.number_of_courts
  );
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
          'player_id', om.player_id,
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

create or replace function public.schedule_current_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.account_deletion_requests%rowtype;
  v_leagues_left integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  v_leagues_left = public.leave_all_my_leagues();

  insert into public.account_deletion_requests (
    user_id,
    requested_at,
    deletion_scheduled_at
  )
  values (
    v_user_id,
    now(),
    now() + interval '30 days'
  )
  on conflict (user_id)
  do update
  set requested_at = excluded.requested_at,
      deletion_scheduled_at = excluded.deletion_scheduled_at
  returning * into v_request;

  return jsonb_build_object(
    'scheduled', true,
    'deletion_scheduled_at', v_request.deletion_scheduled_at,
    'leagues_left', v_leagues_left
  );
end;
$$;

revoke all on function public.set_my_league_player(uuid, uuid) from public;
revoke all on function public.hide_departed_league_player(uuid, uuid, uuid) from public;
revoke all on function public.leave_my_league(uuid, uuid) from public;
revoke all on function public.leave_all_my_leagues() from public;
revoke all on function public.ensure_current_user_player(uuid) from public;
revoke all on function public.join_league_queue(uuid, text, uuid, text, boolean) from public;
revoke all on function public.my_organizations() from public;
revoke all on function public.schedule_current_account_deletion() from public;

grant execute on function public.set_my_league_player(uuid, uuid) to authenticated;
grant execute on function public.leave_my_league(uuid, uuid) to authenticated;
grant execute on function public.ensure_current_user_player(uuid) to authenticated;
grant execute on function public.join_league_queue(uuid, text, uuid, text, boolean) to authenticated;
grant execute on function public.my_organizations() to authenticated;
grant execute on function public.schedule_current_account_deletion() to authenticated;
