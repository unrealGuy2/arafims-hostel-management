begin;

update public.rooms
set price = case room_type
  when 'Room of 3' then 323000
  when 'Room of 2' then 484500
end
from public.hostels
where public.rooms.hostel_id = public.hostels.id
  and public.hostels.name = 'Arafims 1'
  and public.rooms.room_type in ('Room of 3', 'Room of 2');

commit;
