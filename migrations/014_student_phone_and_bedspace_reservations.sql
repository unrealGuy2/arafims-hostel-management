alter table public.student_profiles
add column if not exists phone_number text;

create table if not exists public.bedspace_pre_reservations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete restrict,
  bedspace_number integer not null check (bedspace_number > 0),
  student_name text not null,
  student_phone text not null,
  student_profile_id uuid references public.student_profiles(id) on delete set null,
  status text not null default 'pre_reserved'
    check (status in ('pre_reserved', 'allocated', 'released')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists idx_active_bedspace_pre_reservation
  on public.bedspace_pre_reservations(room_id, bedspace_number)
  where status in ('pre_reserved', 'allocated');
create index if not exists idx_bedspace_pre_reservations_room_id
  on public.bedspace_pre_reservations(room_id);
create index if not exists idx_bedspace_pre_reservations_status
  on public.bedspace_pre_reservations(status);
create index if not exists idx_bedspace_pre_reservations_phone
  on public.bedspace_pre_reservations(student_phone);
create index if not exists idx_bedspace_pre_reservations_name
  on public.bedspace_pre_reservations(student_name);

alter table public.bedspace_pre_reservations enable row level security;

drop policy if exists "Managers can read assigned bedspace reservations" on public.bedspace_pre_reservations;
create policy "Managers can read assigned bedspace reservations"
  on public.bedspace_pre_reservations
  for select
  using (
    exists (
      select 1
      from public.rooms r
      where r.id = bedspace_pre_reservations.room_id
        and public.user_can_access_hostel(r.hostel_id)
    )
  );

create or replace function public.manager_create_bedspace_pre_reservation(
  p_room_id uuid,
  p_bedspace_number integer,
  p_student_name text,
  p_student_phone text
)
returns public.bedspace_pre_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  room_record public.rooms%rowtype;
  reservation_record public.bedspace_pre_reservations%rowtype;
  occupied_count integer;
begin
  if nullif(trim(p_student_name), '') is null
    or nullif(trim(p_student_phone), '') is null then
    raise exception 'Student name and phone number are required';
  end if;

  select r.* into room_record
  from public.rooms r
  where r.id = p_room_id
    and public.user_can_access_hostel(r.hostel_id)
  for update;

  if room_record.id is null then
    raise exception 'Room not found or not authorized';
  end if;

  if p_bedspace_number < 1 or p_bedspace_number > room_record.capacity then
    raise exception 'Invalid bedspace number';
  end if;

  select count(*) into occupied_count
  from public.reservations res
  where res.room_id = p_room_id
    and res.status = 'approved';

  occupied_count := occupied_count + (
    select count(*)
    from public.bedspace_pre_reservations bpr
    where bpr.room_id = p_room_id
      and bpr.status in ('pre_reserved', 'allocated')
  );

  if occupied_count >= room_record.capacity then
    raise exception 'No bedspace remains for this room';
  end if;

  insert into public.bedspace_pre_reservations (
    room_id,
    bedspace_number,
    student_name,
    student_phone,
    created_by
  )
  values (
    p_room_id,
    p_bedspace_number,
    trim(p_student_name),
    trim(p_student_phone),
    auth.uid()
  )
  returning * into reservation_record;

  return reservation_record;
exception
  when unique_violation then
    raise exception 'This bedspace is already reserved';
end;
$$;

create or replace function public.manager_update_bedspace_pre_reservation(
  p_id uuid,
  p_student_name text,
  p_student_phone text
)
returns public.bedspace_pre_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation_record public.bedspace_pre_reservations%rowtype;
begin
  if nullif(trim(p_student_name), '') is null
    or nullif(trim(p_student_phone), '') is null then
    raise exception 'Student name and phone number are required';
  end if;

  update public.bedspace_pre_reservations bpr
  set student_name = trim(p_student_name),
      student_phone = trim(p_student_phone),
      updated_at = timezone('utc'::text, now())
  from public.rooms r
  where bpr.id = p_id
    and bpr.room_id = r.id
    and bpr.status = 'pre_reserved'
    and public.user_can_access_hostel(r.hostel_id)
  returning bpr.* into reservation_record;

  if reservation_record.id is null then
    raise exception 'Bedspace reservation not found or not authorized';
  end if;

  return reservation_record;
end;
$$;

create or replace function public.manager_link_bedspace_pre_reservation(
  p_id uuid,
  p_student_profile_id uuid
)
returns public.bedspace_pre_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation_record public.bedspace_pre_reservations%rowtype;
  profile_record public.student_profiles%rowtype;
begin
  select * into profile_record
  from public.student_profiles
  where id = p_student_profile_id;

  if profile_record.id is null then
    raise exception 'Student profile not found';
  end if;

  update public.bedspace_pre_reservations bpr
  set student_profile_id = profile_record.id,
      student_name = profile_record.full_name,
      student_phone = coalesce(profile_record.phone_number, bpr.student_phone),
      status = 'allocated',
      updated_at = timezone('utc'::text, now())
  from public.rooms r
  where bpr.id = p_id
    and bpr.room_id = r.id
    and bpr.status = 'pre_reserved'
    and public.user_can_access_hostel(r.hostel_id)
  returning bpr.* into reservation_record;

  if reservation_record.id is null then
    raise exception 'Bedspace reservation not found or not authorized';
  end if;

  return reservation_record;
end;
$$;

create or replace function public.manager_release_bedspace_pre_reservation(p_id uuid)
returns public.bedspace_pre_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation_record public.bedspace_pre_reservations%rowtype;
begin
  update public.bedspace_pre_reservations bpr
  set status = 'released',
      updated_at = timezone('utc'::text, now())
  from public.rooms r
  where bpr.id = p_id
    and bpr.room_id = r.id
    and bpr.status in ('pre_reserved', 'allocated')
    and public.user_can_access_hostel(r.hostel_id)
  returning bpr.* into reservation_record;

  if reservation_record.id is null then
    raise exception 'Bedspace reservation not found or not authorized';
  end if;

  return reservation_record;
end;
$$;

create or replace function public.manager_search_student_profiles(p_query text)
returns table (
  id uuid,
  full_name text,
  email text,
  phone_number text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() not in ('manager', 'master_admin') then
    raise exception 'Not authorized';
  end if;

  return query
  select sp.id, sp.full_name, sp.email, sp.phone_number
  from public.student_profiles sp
  where nullif(trim(p_query), '') is not null
    and (
      sp.full_name ilike '%' || trim(p_query) || '%'
      or sp.phone_number ilike '%' || trim(p_query) || '%'
    )
  order by sp.full_name
  limit 20;
end;
$$;

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
      and status in ('pending', 'approved')
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
  pre_reserved_count integer;
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

  if not exists (
    select 1
    from public.hostel_managers hm
    join public.rooms r on r.hostel_id = hm.hostel_id
    where hm.user_id = auth.uid()
      and r.id = reservation_record.room_id
  ) then
    raise exception 'Not authorized';
  end if;

  select * into room_record
  from public.rooms
  where id = reservation_record.room_id
  for update;

  select count(*) into approved_count
  from public.reservations
  where room_id = reservation_record.room_id
    and status = 'approved';

  select count(*) into pre_reserved_count
  from public.bedspace_pre_reservations
  where room_id = reservation_record.room_id
    and status in ('pre_reserved', 'allocated');

  if approved_count + pre_reserved_count >= room_record.capacity then
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

drop function if exists public.room_availability(uuid);
drop function if exists public.room_availability_for_hostel(uuid);

create function public.room_availability_for_hostel(p_hostel_id uuid)
returns table (
  room_id uuid,
  capacity integer,
  occupied_count integer,
  pre_reserved_count integer,
  available_count integer,
  availability_status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with room_counts as (
    select
      r.id as room_id,
      r.capacity,
      count(distinct res.id)::integer as approved_count,
      count(distinct bpr.id) filter (
        where bpr.status in ('pre_reserved', 'allocated')
      )::integer as pre_reserved_count
    from public.rooms r
    left join public.reservations res
      on res.room_id = r.id
      and res.status = 'approved'
    left join public.bedspace_pre_reservations bpr
      on bpr.room_id = r.id
      and bpr.status in ('pre_reserved', 'allocated')
    where r.hostel_id = p_hostel_id
      and r.active = true
    group by r.id, r.capacity
  )
  select
    room_counts.room_id,
    room_counts.capacity,
    room_counts.approved_count + room_counts.pre_reserved_count,
    room_counts.pre_reserved_count,
    room_counts.capacity - room_counts.approved_count - room_counts.pre_reserved_count,
    case
      when room_counts.capacity - room_counts.approved_count - room_counts.pre_reserved_count <= 0 then 'full'
      when room_counts.approved_count + room_counts.pre_reserved_count = 0 then 'available'
      else 'partially_available'
    end
  from room_counts;
end;
$$;

create function public.room_availability(p_room_id uuid)
returns table (
  room_id uuid,
  capacity integer,
  occupied_count integer,
  pre_reserved_count integer,
  available_count integer,
  availability_status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select availability.room_id,
    availability.capacity,
    availability.occupied_count,
    availability.pre_reserved_count,
    availability.available_count,
    availability.availability_status
  from public.room_availability_for_hostel(
    (select hostel_id from public.rooms where id = p_room_id)
  ) as availability
  where availability.room_id = p_room_id;
end;
$$;

revoke all on function public.manager_create_bedspace_pre_reservation(uuid, integer, text, text) from public;
revoke all on function public.manager_update_bedspace_pre_reservation(uuid, text, text) from public;
revoke all on function public.manager_link_bedspace_pre_reservation(uuid, uuid) from public;
revoke all on function public.manager_release_bedspace_pre_reservation(uuid) from public;
revoke all on function public.manager_search_student_profiles(text) from public;
grant execute on function public.manager_create_bedspace_pre_reservation(uuid, integer, text, text) to authenticated;
grant execute on function public.manager_update_bedspace_pre_reservation(uuid, text, text) to authenticated;
grant execute on function public.manager_link_bedspace_pre_reservation(uuid, uuid) to authenticated;
grant execute on function public.manager_release_bedspace_pre_reservation(uuid) to authenticated;
grant execute on function public.manager_search_student_profiles(text) to authenticated;
grant execute on function public.room_availability(uuid) to authenticated;
grant execute on function public.room_availability_for_hostel(uuid) to authenticated;
