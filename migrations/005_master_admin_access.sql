drop policy if exists "Master admins can read all student profiles" on public.student_profiles;
create policy "Master admins can read all student profiles"
  on public.student_profiles
  for select
  using (public.current_user_role() = 'master_admin');
