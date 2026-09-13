create or replace function public.create_reservation(p_student_profile_id uuid, p_room_id uuid)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  student_record public.student_profiles%rowtype;
  room_record public.rooms%rowtype;
  approved_count integer;
  pre_reserved_count integer;
  reservation_record public.reservations%rowtype;
begin
  select * into student_record
  from public.student_profiles
  where id = p_student_profile_id
    and user_id = auth.uid();

  if student_record.id is null then
    raise exception 'Not authorized';
  end if;

  if exists (
    select 1
    from public.reservations
    where student_profile_id = p_student_profile_id
      and status <> 'rejected'
  ) then
    raise exception 'You already have an active reservation';
  end if;

  select * into room_record
  from public.rooms
  where id = p_room_id
  for update;

  if room_record.id is null then
    raise exception 'Room not found';
  end if;

  if not room_record.active then
    raise exception 'This room is unavailable';
  end if;

  if room_record.gender_restriction <> 'ANY' and room_record.gender_restriction <> student_record.gender then
    raise exception 'This room does not match your gender profile';
  end if;

  select count(*) into approved_count
  from public.reservations
  where room_id = p_room_id
    and status = 'approved';

  select count(*) into pre_reserved_count
  from public.bedspace_pre_reservations
  where room_id = p_room_id
    and status in ('pre_reserved', 'allocated');

  if approved_count + pre_reserved_count >= room_record.capacity then
    raise exception 'This room is fully occupied';
  end if;

  insert into public.reservations (student_profile_id, room_id, status, room_price)
  values (p_student_profile_id, p_room_id, 'pending', room_record.price)
  returning * into reservation_record;

  return reservation_record;
end;
$$;
