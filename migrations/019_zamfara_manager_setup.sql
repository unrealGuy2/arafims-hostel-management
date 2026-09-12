alter table public.user_roles
  add column if not exists display_name text,
  add column if not exists must_change_password boolean not null default false;

insert into public.user_roles (user_id, role, display_name, must_change_password)
values (
  '202d1ed1-ebea-4653-92de-a36a48132c7e',
  'manager',
  'SHITTU Mutmainnah Temitope',
  true
)
on conflict (user_id) do update
set role = excluded.role,
    display_name = excluded.display_name,
    must_change_password = true;

delete from public.hostel_managers
where user_id = '202d1ed1-ebea-4653-92de-a36a48132c7e';

insert into public.hostel_managers (user_id, hostel_id)
select
  '202d1ed1-ebea-4653-92de-a36a48132c7e',
  h.id
from public.hostels h
where h.name = 'Zamfara PG'
on conflict (user_id, hostel_id) do nothing;

create or replace function public.clear_temporary_password_requirement()
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_roles
  set must_change_password = false
  where user_id = auth.uid()
    and role = 'manager'
$$;

revoke all on function public.clear_temporary_password_requirement() from public;
grant execute on function public.clear_temporary_password_requirement() to authenticated;
