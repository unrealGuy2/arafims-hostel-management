drop policy if exists "Managers can read assigned reservations" on public.reservations;
create policy "Managers can read assigned reservations"
  on public.reservations
  for select
  using (
    public.user_can_access_hostel(
      (select r.hostel_id from public.rooms r where r.id = reservations.room_id)
    )
  );

create or replace function public.manager_can_access_student_profile(p_student_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.reservations res
    join public.rooms r on r.id = res.room_id
    where res.student_profile_id = p_student_profile_id
      and public.user_can_access_hostel(r.hostel_id)
  )
$$;

revoke all on function public.manager_can_access_student_profile(uuid) from public;
grant execute on function public.manager_can_access_student_profile(uuid) to authenticated;

drop policy if exists "Managers can read reservation student profiles" on public.student_profiles;
create policy "Managers can read reservation student profiles"
  on public.student_profiles
  for select
  using (
    public.manager_can_access_student_profile(student_profiles.id)
  );
