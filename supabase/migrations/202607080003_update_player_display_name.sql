create or replace function public.update_player_display_name(
  p_player_id uuid,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text := nullif(trim(regexp_replace(coalesce(p_display_name, ''), '[[:space:]]+', ' ', 'g')), '');
  v_player public.players%rowtype;
  v_duplicate_count integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if v_display_name is null then
    raise exception 'display name cannot be empty' using errcode = '23514';
  end if;

  if array_length(regexp_split_to_array(v_display_name, '[[:space:]]+'), 1) < 2 then
    raise exception 'first and last name are required' using errcode = '23514';
  end if;

  select * into v_player
  from public.players
  where id = p_player_id
    and active
  for update;

  if not found then
    raise exception 'active player % not found', p_player_id using errcode = 'P0002';
  end if;

  if v_player.user_id is not null and v_player.user_id <> v_user_id then
    raise exception 'that player name is already claimed' using errcode = '42501';
  end if;

  select count(*) into v_duplicate_count
  from public.players
  where organization_id = v_player.organization_id
    and active
    and id <> p_player_id
    and lower(trim(display_name)) = lower(v_display_name);

  if v_duplicate_count > 0 then
    raise exception 'that player already exists in this league' using errcode = '23514';
  end if;

  update public.players
  set display_name = v_display_name,
      user_id = coalesce(user_id, v_user_id)
  where id = p_player_id
  returning * into v_player;

  if v_player.user_id = v_user_id then
    insert into public.profiles (id, display_name, avatar_path)
    values (v_user_id, v_player.display_name, v_player.profile_image_path)
    on conflict (id)
    do update
    set display_name = excluded.display_name,
        avatar_path = coalesce(excluded.avatar_path, public.profiles.avatar_path);
  end if;

  return jsonb_build_object(
    'id', v_player.id,
    'display_name', v_player.display_name,
    'rating', v_player.rating,
    'profile_image_path', v_player.profile_image_path,
    'created_at', v_player.created_at,
    'has_account', v_player.user_id is not null
  );
end;
$$;

grant execute on function public.update_player_display_name(uuid, text) to authenticated;
