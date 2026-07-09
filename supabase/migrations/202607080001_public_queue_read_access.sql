create or replace function public.organization_open_sessions(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
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
          'created_at', p.created_at,
          'has_account', p.user_id is not null
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

grant execute on function public.organization_open_sessions(uuid) to anon, authenticated;
grant execute on function public.session_recommendation_snapshot(uuid) to anon, authenticated;
grant execute on function public.active_recommendations(uuid) to anon, authenticated;
grant execute on function public.active_matches(uuid) to anon, authenticated;
grant execute on function public.completed_matches(uuid) to anon, authenticated;
grant execute on function public.session_player_options(uuid) to anon, authenticated;
grant execute on function public.league_player_name_matches(uuid, text) to anon, authenticated;
