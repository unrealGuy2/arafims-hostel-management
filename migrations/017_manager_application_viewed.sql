alter table public.student_profiles
  add column if not exists manager_viewed_at timestamptz;

create or replace function public.mark_student_application_viewed(
  p_student_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() not in ('manager', 'master_admin') then
    return false;
  end if;

  update public.student_profiles sp
  set manager_viewed_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where sp.id = p_student_profile_id
    and exists (
      select 1
      from public.reservations res
      join public.rooms r on r.id = res.room_id
      left join public.hostel_managers hm
        on hm.hostel_id = r.hostel_id
       and hm.user_id = auth.uid()
      where res.student_profile_id = sp.id
        and (
          public.current_user_role() = 'master_admin'
          or hm.user_id is not null
        )
    );

  return found;
end;
$$;

revoke all on function public.mark_student_application_viewed(uuid) from public;
grant execute on function public.mark_student_application_viewed(uuid) to authenticated;
