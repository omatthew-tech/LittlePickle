-- Restore the latest match-score join used by the player-filtered history.
-- The initial profile dashboard migration referenced the `ms` alias without
-- defining it in the completed-match query.

create or replace function public.player_completed_matches(
  p_organization_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_score_mode_enabled boolean;
begin
  select score_mode_enabled into v_score_mode_enabled
  from public.organizations
  where id = p_organization_id;

  if not found then
    raise exception 'league % not found', p_organization_id using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.players
    where id = p_player_id
      and organization_id = p_organization_id
      and active
  ) then
    raise exception 'active player % not found in league %', p_player_id, p_organization_id
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'player_id', p_player_id,
    'score_mode_enabled', v_score_mode_enabled,
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
        where m.organization_id = p_organization_id
          and m.status = 'completed'
          and exists (
            select 1
            from public.match_players current_player
            where current_player.match_id = m.id
              and current_player.player_id = p_player_id
          )
      ),
      '[]'::jsonb
    )
  );
end;
$$;

grant execute on function public.player_completed_matches(uuid, uuid) to anon, authenticated;
