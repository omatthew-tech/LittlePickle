-- Empty queues are terminal. Closing the last active queue membership ends the
-- play session, invalidates its recommendation batch, and prevents stale match
-- cards from being returned for players who have left.

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
    -- No active queue member can own an active match. Cancel any inconsistent
    -- orphan match defensively so the empty session always reaches closed.
    perform public.finalize_play_session(v_session_id, true);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
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

  if v_session.status <> 'open' or not exists (
    select 1
    from public.session_players
    where session_id = p_session_id
      and status = 'active'
  ) then
    return jsonb_build_object(
      'algorithm_version', null,
      'session_id', p_session_id,
      'recommendation_count', v_session.court_count_snapshot + 1,
      'batch_id', null,
      'recommendations', '[]'::jsonb
    );
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
          and not exists (
            select 1
            from public.recommendation_players queued_recommendation_player
            left join public.session_players queued_player
              on queued_player.session_id = p_session_id
             and queued_player.player_id = queued_recommendation_player.player_id
            where queued_recommendation_player.recommendation_id = mr.id
              and queued_player.status is distinct from 'active'
          )
          and not exists (
            select 1
            from public.recommendation_players conflicting_player
            join public.match_players active_player
              on active_player.player_id = conflicting_player.player_id
            join public.matches active_match
              on active_match.id = active_player.match_id
            where conflicting_player.recommendation_id = mr.id
              and active_match.session_id = p_session_id
              and active_match.status = 'active'
          )
      ),
      '[]'::jsonb
    )
  );
end;
$$;

-- Reconcile empty sessions created before this invariant was installed.
do $$
declare
  v_session_id uuid;
begin
  for v_session_id in
    select ps.id
    from public.play_sessions ps
    where ps.status = 'open'
      and not exists (
        select 1
        from public.session_players sp
        where sp.session_id = ps.id
          and sp.status = 'active'
      )
    order by ps.started_at
  loop
    perform public.finalize_play_session(v_session_id, true);
  end loop;
end;
$$;

revoke all on function public.close_session_after_queue_change() from public, anon, authenticated;
grant execute on function public.active_recommendations(uuid) to anon, authenticated;
