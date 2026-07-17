create or replace function public.update_completed_match_score(
  p_match_id uuid,
  p_team_one_score integer,
  p_team_two_score integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_score public.match_scores%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_team_one_score is null or p_team_two_score is null then
    raise exception 'both scores are required' using errcode = '23514';
  end if;

  if p_team_one_score < 0 or p_team_two_score < 0 then
    raise exception 'scores cannot be negative' using errcode = '23514';
  end if;

  select * into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'match % not found', p_match_id using errcode = 'P0002';
  end if;

  if not public.is_org_member(v_match.organization_id, auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_match.status <> 'completed' then
    raise exception 'only completed match scores can be edited' using errcode = '23514';
  end if;

  -- Corrections are append-only so the original report remains available for audit.
  insert into public.match_scores (
    match_id,
    team_one_score,
    team_two_score,
    reported_by
  )
  values (
    p_match_id,
    p_team_one_score,
    p_team_two_score,
    auth.uid()
  )
  returning * into v_score;

  return jsonb_build_object(
    'match_id', v_score.match_id,
    'team_one_score', v_score.team_one_score,
    'team_two_score', v_score.team_two_score
  );
end;
$$;

revoke all on function public.update_completed_match_score(uuid, integer, integer)
from public, anon, authenticated;

grant execute on function public.update_completed_match_score(uuid, integer, integer)
to authenticated;
