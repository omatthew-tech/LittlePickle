create or replace function public.update_player_profile_image(
  p_player_id uuid,
  p_profile_image_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile_image_path text := nullif(trim(coalesce(p_profile_image_path, '')), '');
  v_player public.players%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if v_profile_image_path is null then
    raise exception 'profile image path cannot be empty' using errcode = '23514';
  end if;

  if split_part(v_profile_image_path, '/', 1) <> v_user_id::text then
    raise exception 'profile image path does not belong to the current user' using errcode = '42501';
  end if;

  select * into v_player
  from public.players
  where id = p_player_id
    and active
  for update;

  if not found then
    raise exception 'active player % not found', p_player_id using errcode = 'P0002';
  end if;

  update public.players
  set profile_image_path = v_profile_image_path
  where id = p_player_id
  returning * into v_player;

  if v_player.user_id = v_user_id then
    insert into public.profiles (id, display_name, avatar_path)
    values (v_user_id, v_player.display_name, v_player.profile_image_path)
    on conflict (id)
    do update
    set display_name = excluded.display_name,
        avatar_path = excluded.avatar_path;
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

grant execute on function public.update_player_profile_image(uuid, text) to authenticated;
