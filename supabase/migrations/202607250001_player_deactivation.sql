-- Deactivation immediately removes a shared player identity from active app
-- surfaces while preserving a 30-day recovery window for support and league
-- administrators. After that window, personally identifying profile data and
-- the player's rating ledger are purged while anonymized match participation
-- remains intact.

alter table public.players
add column if not exists deactivated_at timestamptz;

alter table public.players
add column if not exists deletion_scheduled_at timestamptz;

alter table public.players
add column if not exists deactivated_by uuid references auth.users(id) on delete set null;

alter table public.players
add column if not exists personal_data_deleted_at timestamptz;

create index if not exists players_deletion_schedule_idx
on public.players (deletion_scheduled_at)
where deletion_scheduled_at is not null
  and personal_data_deleted_at is null;

create table if not exists public.player_profile_image_deletion_queue (
  profile_image_path text primary key,
  player_id uuid not null,
  queued_at timestamptz not null default now()
);

alter table public.player_profile_image_deletion_queue enable row level security;
revoke all on table public.player_profile_image_deletion_queue from public, anon, authenticated;

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
          'display_name', p.display_name,
          'rating', p.rating,
          'profile_image_path', p.profile_image_path,
          'active', p.active,
          'created_at', p.created_at,
          'deactivated_at', p.deactivated_at,
          'deletion_scheduled_at', p.deletion_scheduled_at,
          'personal_data_deleted_at', p.personal_data_deleted_at
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

create or replace function public.deactivate_player(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_player public.players%rowtype;
  v_session_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_player
  from public.players
  where id = p_player_id
    and active
  for update;

  if not found then
    raise exception 'active player % not found', p_player_id using errcode = 'P0002';
  end if;

  if not public.is_org_member(v_player.organization_id, v_user_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if exists (
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
  set active = false,
      deactivated_at = now(),
      deletion_scheduled_at = now() + interval '30 days',
      deactivated_by = v_user_id,
      personal_data_deleted_at = null
  where id = p_player_id
  returning * into v_player;

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

  return jsonb_build_object(
    'player_id', v_player.id,
    'deactivated_at', v_player.deactivated_at,
    'deletion_scheduled_at', v_player.deletion_scheduled_at
  );
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

  if p_active and v_player.personal_data_deleted_at is not null then
    raise exception 'player data was already permanently deleted' using errcode = '23514';
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
      active = p_active,
      deactivated_at = case
        when p_active then null
        else coalesce(deactivated_at, now())
      end,
      deletion_scheduled_at = case
        when p_active then null
        else coalesce(deletion_scheduled_at, now() + interval '30 days')
      end,
      deactivated_by = case
        when p_active then null
        else coalesce(deactivated_by, v_user_id)
      end
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

create or replace function public.purge_due_deactivated_players()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players%rowtype;
  v_purged_count integer := 0;
begin
  for v_player in
    select *
    from public.players
    where active = false
      and deletion_scheduled_at is not null
      and deletion_scheduled_at <= now()
      and personal_data_deleted_at is null
    order by deletion_scheduled_at
    limit 500
    for update skip locked
  loop
    if v_player.profile_image_path is not null then
      insert into public.player_profile_image_deletion_queue (
        profile_image_path,
        player_id
      )
      values (
        v_player.profile_image_path,
        v_player.id
      )
      on conflict (profile_image_path) do nothing;
    end if;

    delete from public.player_rating_events
    where player_id = v_player.id;

    update public.players
    set display_name = 'Deleted player',
        rating = 3.00,
        profile_image_path = null,
        deactivated_by = null,
        deletion_scheduled_at = null,
        personal_data_deleted_at = now()
    where id = v_player.id;

    v_purged_count := v_purged_count + 1;
  end loop;

  return v_purged_count;
end;
$$;

create or replace function public.pending_player_profile_image_deletions()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'profile_image_path', queued.profile_image_path,
        'player_id', queued.player_id
      )
      order by queued.queued_at
    ),
    '[]'::jsonb
  )
  from (
    select *
    from public.player_profile_image_deletion_queue
    order by queued_at
    limit 1000
  ) queued;
$$;

create or replace function public.complete_player_profile_image_deletions(
  p_profile_image_paths text[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer;
begin
  delete from public.player_profile_image_deletion_queue
  where profile_image_path = any(coalesce(p_profile_image_paths, array[]::text[]));

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

revoke all on function public.purge_due_deactivated_players()
from public, anon, authenticated;

revoke all on function public.pending_player_profile_image_deletions()
from public, anon, authenticated;

revoke all on function public.complete_player_profile_image_deletions(text[])
from public, anon, authenticated;

grant execute on function public.organization_players_for_admin(uuid) to authenticated;
grant execute on function public.deactivate_player(uuid) to authenticated;
grant execute on function public.update_organization_player(uuid, text, numeric, boolean) to authenticated;
grant execute on function public.purge_due_deactivated_players() to service_role;
grant execute on function public.pending_player_profile_image_deletions() to service_role;
grant execute on function public.complete_player_profile_image_deletions(text[]) to service_role;

select cron.schedule(
  'littlepickle-player-data-retention',
  '15 * * * *',
  $cron$select public.purge_due_deactivated_players();$cron$
);
