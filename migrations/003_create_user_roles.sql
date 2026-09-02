create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('student', 'manager', 'master_admin')),
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.user_roles enable row level security;

drop policy if exists "Users can read their own role" on public.user_roles;
create policy "Users can read their own role"
  on public.user_roles
  for select
  using (user_id = auth.uid());

drop policy if exists "Users cannot change their role" on public.user_roles;
create policy "Users cannot change their role"
  on public.user_roles
  for insert
  with check (false);

drop policy if exists "Users cannot update their role" on public.user_roles;
create policy "Users cannot update their role"
  on public.user_roles
  for update
  using (false)
  with check (false);

drop policy if exists "Users cannot delete their role" on public.user_roles;
create policy "Users cannot delete their role"
  on public.user_roles
  for delete
  using (false);

insert into public.user_roles (user_id, role)
select user_id, 'student'
from public.student_profiles
on conflict (user_id) do nothing;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.user_roles
  where user_id = auth.uid()
$$;

create or replace function public.user_can_access_hostel(p_hostel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and (
        ur.role = 'master_admin'
        or (
          ur.role = 'manager'
          and exists (
            select 1
            from public.hostel_managers hm
            where hm.user_id = ur.user_id
              and hm.hostel_id = p_hostel_id
          )
        )
      )
  )
$$;

revoke all on function public.current_user_role() from public;
revoke all on function public.user_can_access_hostel(uuid) from public;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.user_can_access_hostel(uuid) to authenticated;
