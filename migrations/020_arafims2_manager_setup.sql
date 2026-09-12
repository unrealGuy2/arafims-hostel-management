insert into public.user_roles (user_id, role, display_name, must_change_password)
values (
  '46e301e7-b2d3-4f70-92b6-d6600e64b4ff',
  'manager',
  'Victor',
  true
)
on conflict (user_id) do update
set role = excluded.role,
    display_name = excluded.display_name,
    must_change_password = true;

delete from public.hostel_managers
where user_id = '46e301e7-b2d3-4f70-92b6-d6600e64b4ff';

insert into public.hostel_managers (user_id, hostel_id)
select
  '46e301e7-b2d3-4f70-92b6-d6600e64b4ff',
  h.id
from public.hostels h
where h.name = 'Arafims 2'
on conflict (user_id, hostel_id) do nothing;
