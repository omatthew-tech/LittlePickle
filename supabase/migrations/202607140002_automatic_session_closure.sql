-- Session lifecycle is automatic: an empty queue closes immediately, and a
-- daily hard cutoff closes any remaining sessions at 4:00 AM Eastern Time.

create extension if not exists pg_cron;

create or replace function public.finalize_play_session(
  p_session_id uuid,
  p_cancel_active_matches boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_status public.play_session_status;
begin
  select status into v_session_status
  from public.play_sessions
  where id = p_session_id
  for update;

  if not found or v_session_status = 'closed' then
    return false;
  end if;

  if exists (
    select 1
    from public.matches
    where session_id = p_session_id
      and status = 'active'
  ) then
    if not p_cancel_active_matches then
      return false;
    end if;

    update public.matches
    set status = 'cancelled',
        completed_at = now()
    where session_id = p_session_id
      and status = 'active';
  end if;

  update public.play_sessions
  set status = 'closed',
      ended_at = now()
  where id = p_session_id
    and status = 'open';

  if not found then
    return false;
  end if;

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

  return true;
end;
$$;

create or replace function public.close_session_after_queue_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'active' then
      return old;
    end if;

    v_session_id = old.session_id;
  else
    if old.status <> 'active' or new.status = 'active' then
      return new;
    end if;

    v_session_id = new.session_id;
  end if;

  if not exists (
    select 1
    from public.session_players
    where session_id = v_session_id
      and status = 'active'
  ) then
    -- A queue cannot be closed while a match is active. Match participants are
    -- not removable in the app, so this is primarily a defensive safeguard.
    perform public.finalize_play_session(v_session_id, false);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists close_session_when_queue_becomes_empty
on public.session_players;

create trigger close_session_when_queue_becomes_empty
after update of status or delete on public.session_players
for each row
execute function public.close_session_after_queue_change();

create or replace function public.close_open_play_sessions_at_daily_cutoff()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closed_count integer := 0;
  v_session_id uuid;
begin
  -- The cron job runs hourly so this remains correct across Eastern daylight
  -- saving time without changing the database server's global timezone.
  if extract(hour from timezone('America/New_York', now()))::integer <> 4 then
    return 0;
  end if;

  for v_session_id in
    select id
    from public.play_sessions
    where status = 'open'
    order by started_at
  loop
    if public.finalize_play_session(v_session_id, true) then
      v_closed_count = v_closed_count + 1;
    end if;
  end loop;

  return v_closed_count;
end;
$$;

revoke all on function public.finalize_play_session(uuid, boolean) from public, anon, authenticated;
revoke all on function public.close_session_after_queue_change() from public, anon, authenticated;
revoke all on function public.close_open_play_sessions_at_daily_cutoff() from public, anon, authenticated;
revoke all on function public.close_play_session(uuid) from public, anon, authenticated;

select cron.schedule(
  'littlepickle-daily-session-cutoff',
  '0 * * * *',
  $cron$select public.close_open_play_sessions_at_daily_cutoff();$cron$
);
