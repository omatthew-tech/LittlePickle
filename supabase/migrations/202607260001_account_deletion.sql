-- Account deletion is separate from shared player-profile deletion. A request
-- disables the Supabase Auth identity immediately at the trusted API layer and
-- schedules permanent removal after 30 days. The backend retention worker uses
-- the service-only functions below to remove user-owned storage objects before
-- deleting the Auth user.

create table if not exists public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  deletion_scheduled_at timestamptz not null
);

create index if not exists account_deletion_requests_schedule_idx
on public.account_deletion_requests (deletion_scheduled_at);

alter table public.account_deletion_requests enable row level security;
revoke all on table public.account_deletion_requests from public, anon, authenticated;

create or replace function public.schedule_current_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.account_deletion_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

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
    'deletion_scheduled_at', v_request.deletion_scheduled_at
  );
end;
$$;

create or replace function public.cancel_account_deletion(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.account_deletion_requests
  where user_id = p_user_id;
$$;

create or replace function public.due_account_deletions()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', due.user_id,
        'deletion_scheduled_at', due.deletion_scheduled_at
      )
      order by due.deletion_scheduled_at
    ),
    '[]'::jsonb
  )
  from (
    select user_id, deletion_scheduled_at
    from public.account_deletion_requests
    where deletion_scheduled_at <= now()
    order by deletion_scheduled_at
    limit 100
  ) due;
$$;

create or replace function public.prepare_account_auth_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_image_paths text[];
begin
  if not exists (
    select 1
    from public.account_deletion_requests
    where user_id = p_user_id
      and deletion_scheduled_at <= now()
  ) then
    raise exception 'account deletion is not due for user %', p_user_id using errcode = '23514';
  end if;

  select coalesce(array_agg(o.name order by o.name), array[]::text[])
  into v_profile_image_paths
  from storage.objects o
  where o.bucket_id = 'profile-pictures'
    and o.name like p_user_id::text || '/%';

  update public.players
  set profile_image_path = null
  where profile_image_path = any(v_profile_image_paths);

  return jsonb_build_object(
    'user_id', p_user_id,
    'profile_image_paths', to_jsonb(v_profile_image_paths)
  );
end;
$$;

revoke all on function public.schedule_current_account_deletion() from public;
revoke all on function public.cancel_account_deletion(uuid) from public;
revoke all on function public.due_account_deletions() from public;
revoke all on function public.prepare_account_auth_deletion(uuid) from public;

grant execute on function public.schedule_current_account_deletion() to authenticated;
grant execute on function public.cancel_account_deletion(uuid) to service_role;
grant execute on function public.due_account_deletions() to service_role;
grant execute on function public.prepare_account_auth_deletion(uuid) to service_role;
