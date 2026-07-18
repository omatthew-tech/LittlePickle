create or replace function public.normalized_match_result(
  p_score_mode_enabled boolean,
  p_result_mode text,
  p_team_one_score integer,
  p_team_two_score integer,
  p_winning_team integer
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_expected_mode text := case when p_score_mode_enabled then 'score' else 'win_loss' end;
  v_winning_team integer;
begin
  if p_result_mode is distinct from v_expected_mode then
    raise exception 'score mode changed; reopen the result form and try again' using errcode = '23514';
  end if;

  if p_result_mode = 'score' then
    if p_team_one_score is null or p_team_two_score is null then
      raise exception 'both scores are required' using errcode = '23514';
    end if;

    if p_team_one_score < 0 or p_team_two_score < 0 then
      raise exception 'scores cannot be negative' using errcode = '23514';
    end if;

    if p_team_one_score = p_team_two_score then
      raise exception 'scores cannot be tied' using errcode = '23514';
    end if;

    v_winning_team := case when p_team_one_score > p_team_two_score then 1 else 2 end;

    return jsonb_build_object(
      'result_mode', 'score',
      'team_one_score', p_team_one_score,
      'team_two_score', p_team_two_score,
      'winning_team', v_winning_team
    );
  end if;

  if p_result_mode = 'win_loss' then
    if p_winning_team is null or p_winning_team not in (1, 2) then
      raise exception 'winning team must be 1 or 2' using errcode = '23514';
    end if;

    return jsonb_build_object(
      'result_mode', 'win_loss',
      'team_one_score', null,
      'team_two_score', null,
      'winning_team', p_winning_team
    );
  end if;

  raise exception 'result mode must be score or win_loss' using errcode = '23514';
end;
$$;

revoke all on function public.normalized_match_result(boolean, text, integer, integer, integer)
from public, anon, authenticated;
