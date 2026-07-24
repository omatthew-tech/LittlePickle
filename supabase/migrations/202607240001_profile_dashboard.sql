-- Profile dashboard data is scoped to the active player and their league.
-- Player identities are shared, so these read functions follow the same public
-- access model as the existing league roster and match-history RPCs.

create index if not exists players_profile_rating_idx
on public.players (organization_id, active, rating desc, display_name);

create index if not exists match_players_player_match_idx
on public.match_players (player_id, match_id);

create or replace function public.player_profile_overview(
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
  v_player public.players%rowtype;
  v_rank integer;
  v_match_count integer;
  v_hours_played integer;
  v_nearby_players jsonb;
begin
  select * into v_player
  from public.players
  where id = p_player_id
    and organization_id = p_organization_id
    and active;

  if not found then
    raise exception 'active player % not found in league %', p_player_id, p_organization_id
      using errcode = 'P0002';
  end if;

  select count(*)::integer + 1 into v_rank
  from public.players
  where organization_id = p_organization_id
    and active
    and rating > v_player.rating;

  select
    count(*)::integer,
    coalesce(
      round(
        sum(
          greatest(
            extract(epoch from (coalesce(m.completed_at, m.started_at) - m.started_at)),
            0
          )
        ) / 3600.0
      ),
      0
    )::integer
  into v_match_count, v_hours_played
  from public.matches m
  where m.organization_id = p_organization_id
    and m.status = 'completed'
    and exists (
      select 1
      from public.match_players mp
      where mp.match_id = m.id
        and mp.player_id = p_player_id
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', nearby.id,
        'display_name', nearby.display_name,
        'profile_image_path', nearby.profile_image_path,
        'rating', nearby.rating
      )
      order by nearby.rating_difference, lower(nearby.display_name), nearby.created_at, nearby.id
    ),
    '[]'::jsonb
  )
  into v_nearby_players
  from (
    select
      p.id,
      p.display_name,
      p.profile_image_path,
      p.rating,
      p.created_at,
      abs(p.rating - v_player.rating) as rating_difference
    from public.players p
    where p.organization_id = p_organization_id
      and p.active
      and p.id <> p_player_id
    order by
      abs(p.rating - v_player.rating),
      lower(p.display_name),
      p.created_at,
      p.id
    limit 3
  ) nearby;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'player', jsonb_build_object(
      'id', v_player.id,
      'display_name', v_player.display_name,
      'profile_image_path', v_player.profile_image_path,
      'rating', v_player.rating
    ),
    'stats', jsonb_build_object(
      'rank', v_rank,
      'hours_played', v_hours_played,
      'match_count', v_match_count
    ),
    'nearby_players', v_nearby_players
  );
end;
$$;

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

grant execute on function public.player_profile_overview(uuid, uuid) to anon, authenticated;
grant execute on function public.player_completed_matches(uuid, uuid) to anon, authenticated;
