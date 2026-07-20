-- Match history is scoped to the league that owns the requested session, not
-- only to that individual session.
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
            'result_mode', ms.result_mode,
            'team_one_score', ms.team_one_score,
            'team_two_score', ms.team_two_score,
            'winning_team', ms.winning_team,
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
          select result_mode, team_one_score, team_two_score, winning_team
          from public.match_scores
          where match_id = m.id
          order by created_at desc, id desc
          limit 1
        ) ms on true
        where m.organization_id = v_session.organization_id
          and m.status = 'completed'
      ),
      '[]'::jsonb
    )
  );
end;
$$;
