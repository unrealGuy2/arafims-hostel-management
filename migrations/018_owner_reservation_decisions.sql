create or replace function public.approve_reservation(p_reservation_id uuid)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation_record public.reservations%rowtype;
  room_record public.rooms%rowtype;
  approved_count integer;
begin
  select * into reservation_record
  from public.reservations
  where id = p_reservation_id
  for update;

  if reservation_record.id is null then
    raise exception 'Reservation not found';
  end if;

  if reservation_record.status <> 'pending' then
    raise exception 'Reservation is not pending';
  end if;

  if not (
    public.current_user_role() = 'master_admin'
    or exists (
      select 1
      from public.hostel_managers hm
      join public.rooms r on r.hostel_id = hm.hostel_id
      where hm.user_id = auth.uid()
        and r.id = reservation_record.room_id
    )
  ) then
    raise exception 'Not authorized';
  end if;

  select * into room_record
  from public.rooms
  where id = reservation_record.room_id
  for update;

  select coalesce(count(*), 0) into approved_count
  from public.reservations
  where room_id = reservation_record.room_id
    and status = 'approved';

  if approved_count >= room_record.capacity then
    raise exception 'No bedspace remains for this room';
  end if;

  update public.reservations
  set status = 'approved',
      updated_at = timezone('utc'::text, now())
  where id = p_reservation_id
  returning * into reservation_record;

  return reservation_record;
end;
$$;

create or replace function public.reject_reservation(p_reservation_id uuid, p_reason text default null)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation_record public.reservations%rowtype;
begin
  select * into reservation_record
  from public.reservations
  where id = p_reservation_id
  for update;

  if reservation_record.id is null then
    raise exception 'Reservation not found';
  end if;

  if reservation_record.status <> 'pending' then
    raise exception 'Reservation is not pending';
  end if;

  if not (
    public.current_user_role() = 'master_admin'
    or exists (
      select 1
      from public.hostel_managers hm
      join public.rooms r on r.hostel_id = hm.hostel_id
      where hm.user_id = auth.uid()
        and r.id = reservation_record.room_id
    )
  ) then
    raise exception 'Not authorized';
  end if;

  update public.reservations
  set status = 'rejected',
      decision_reason = p_reason,
      updated_at = timezone('utc'::text, now())
  where id = p_reservation_id
  returning * into reservation_record;

  return reservation_record;
end;
$$;
