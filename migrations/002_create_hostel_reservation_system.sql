create table if not exists public.hostels (
  id uuid primary key,
  name text not null unique,
  slug text not null unique,
  description text,
  active boolean not null default true,
  public_section_enabled boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.rooms (
  id uuid primary key,
  hostel_id uuid not null references public.hostels(id) on delete cascade,
  room_number text not null,
  room_type text not null,
  room_category text not null default 'STANDARD' check (room_category in ('STANDARD', 'PRIVATE', 'PUBLIC')),
  capacity integer not null check (capacity > 0),
  price numeric(12,2) not null check (price >= 0),
  gender_restriction text not null default 'ANY' check (gender_restriction in ('ANY', 'MALE', 'FEMALE')),
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (hostel_id, room_number)
);

create table if not exists public.hostel_managers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  hostel_id uuid not null references public.hostels(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (user_id, hostel_id)
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.student_profiles(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  room_price numeric(12,2) not null,
  decision_reason text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_rooms_hostel_id on public.rooms(hostel_id);
create index if not exists idx_rooms_active on public.rooms(active);
create index if not exists idx_reservations_student_profile_id on public.reservations(student_profile_id);
create index if not exists idx_reservations_room_id on public.reservations(room_id);
create index if not exists idx_reservations_status on public.reservations(status);
create unique index if not exists idx_single_active_reservation on public.reservations(student_profile_id) where status in ('pending', 'approved');

alter table public.hostels enable row level security;
alter table public.rooms enable row level security;
alter table public.hostel_managers enable row level security;
alter table public.reservations enable row level security;

drop policy if exists "Students can create reservations for themselves" on public.reservations;
drop policy if exists "Managers can manage reservations for their hostel" on public.reservations;
drop index if exists idx_active_reservations;

create policy "Authenticated users can read active hostels" on public.hostels for select using (auth.uid() is not null and active = true);
create policy "Authenticated users can read active rooms" on public.rooms for select using (auth.uid() is not null and active = true);
create policy "Managers can read assigned hostel mappings" on public.hostel_managers for select using (user_id = auth.uid());
create policy "Students can read their own reservations" on public.reservations for select using (student_profile_id in (select id from public.student_profiles where user_id = auth.uid()));
create policy "Students cannot insert reservations directly" on public.reservations for insert with check (false);
create policy "Managers cannot update reservations directly" on public.reservations for update using (false) with check (false);
create policy "Students cannot delete reservations" on public.reservations for delete using (false);

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

  select coalesce(count(*), 0) into approved_count
  from public.reservations
  where room_id = p_room_id
    and status = 'approved';

  if approved_count >= room_record.capacity then
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

  if not exists (
    select 1
    from public.hostel_managers hm
    join public.rooms r on r.hostel_id = hm.hostel_id
    where hm.user_id = auth.uid()
      and r.id = reservation_record.room_id
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

create or replace function public.room_availability_for_hostel(p_hostel_id uuid)
returns table (
  room_id uuid,
  capacity integer,
  occupied_count integer,
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
      coalesce(count(res.id), 0) as occupied_count
    from public.rooms r
    left join public.reservations res on res.room_id = r.id and res.status = 'approved'
    where r.hostel_id = p_hostel_id
      and r.active = true
    group by r.id, r.capacity
  )
  select
    room_counts.room_id,
    room_counts.capacity,
    room_counts.occupied_count,
    room_counts.capacity - room_counts.occupied_count as available_count,
    case
      when room_counts.capacity - room_counts.occupied_count <= 0 then 'full'
      when room_counts.occupied_count = 0 then 'available'
      else 'partially_available'
    end as availability_status
  from room_counts;
end;
$$;

create or replace function public.room_availability(p_room_id uuid)
returns table (
  room_id uuid,
  capacity integer,
  occupied_count integer,
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
    availability.available_count,
    availability.availability_status
  from public.room_availability_for_hostel(
    (select hostel_id from public.rooms where id = p_room_id)
  ) as availability
  where availability.room_id = p_room_id;
end;
$$;

grant execute on function public.create_reservation(uuid, uuid) to authenticated;
grant execute on function public.approve_reservation(uuid) to authenticated;
grant execute on function public.reject_reservation(uuid, text) to authenticated;
grant execute on function public.room_availability(uuid) to authenticated;
grant execute on function public.room_availability_for_hostel(uuid) to authenticated;

INSERT INTO public.hostels (id, name, slug, description, active, public_section_enabled) VALUES
  ('8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'Arafims 1', 'arafims-1', 'Arafims 1 hostel', true, false ),
  ('cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'Arafims 2', 'arafims-2', 'Arafims 2 hostel', true, false ),
  ('e1eaf912-794d-5b65-b715-438c89225259', 'Zamfara PG', 'zamfara-pg', 'Zamfara postgraduate hostel', true, true );

INSERT INTO public.rooms (id, hostel_id, room_number, room_type, room_category, capacity, price, gender_restriction, active) VALUES
  ('42b6e866-ac6b-5ea5-8023-0698f752f5c7', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'A1', 'Room of 6', 'STANDARD', 6, 201000, 'ANY', true),
  ('12088584-732f-568d-a565-32184ea9528e', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'A3', 'Room of 10', 'STANDARD', 10, 173000, 'ANY', true),
  ('a8dfef64-a73c-5be7-a4fa-0513a9e3bc19', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'A9', 'Room of 10', 'STANDARD', 10, 173000, 'ANY', true),
  ('28733f6a-423b-55fc-9c46-357d71a0522c', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'A13', 'Room of 3', 'STANDARD', 3, 310000, 'ANY', true),
  ('e24a78fc-4310-5241-9a63-97e2d4075345', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'A14', 'Room of 3', 'STANDARD', 3, 310000, 'ANY', true),
  ('847796f8-1f0c-5e5d-ace8-118a98463d24', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'A15', 'Room of 3', 'STANDARD', 3, 310000, 'ANY', true),
  ('6c770106-f262-55da-91ce-ec2d306343e9', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'A19', 'Room of 3', 'STANDARD', 3, 310000, 'ANY', true),
  ('b0a7c76d-78ea-51fd-a89c-ac541256c159', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'A20', 'Room of 3', 'STANDARD', 3, 310000, 'ANY', true),
  ('efa6174e-03f1-5498-aa79-0390a65f048c', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'A21', 'Room of 3', 'STANDARD', 3, 310000, 'ANY', true),
  ('57256725-e064-5e9b-93e0-4e34331f87d5', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'A22', 'Room of 3', 'STANDARD', 3, 310000, 'ANY', true),
  ('24606dce-3ba6-5ff6-8c26-0e3c71e3ea57', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'A23', 'Room of 3', 'STANDARD', 3, 310000, 'ANY', true),
  ('75562d82-4ee3-560a-941d-9d02ef2b3b7e', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'A24', 'Room of 3', 'STANDARD', 3, 310000, 'ANY', true),
  ('a1b9db81-5d7d-5887-8fbe-5172aed881d4', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'A16', 'Room of 2', 'STANDARD', 2, 459000, 'ANY', true),
  ('d0bb380e-0bc0-5da0-85c9-7806fc67e072', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'A17', 'Room of 2', 'STANDARD', 2, 459000, 'ANY', true),
  ('0f0153f6-28c9-5680-89b9-9e8b43124527', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'A18', 'Room of 2', 'STANDARD', 2, 459000, 'ANY', true),
  ('4d68842c-4cbf-5d55-814a-18c70f9cd1fb', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B1', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('e29090fc-7d9a-5a7d-8d61-6681894f3597', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B2', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('cce9571a-3d40-58e1-abc1-84a082e341eb', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B3', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('afe83e42-cac6-5ccf-89d0-db7542a63f09', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B4', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('aecbc70e-0da3-54d2-8a9b-aec161a465f0', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B5', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('4d369080-e22a-554c-9f98-d3e706c20c88', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B6', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('ca445d91-bb81-552a-9157-f188bc6e8c9b', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B7', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('3bd5c5cc-f99e-5751-a100-3324d70e1752', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B8', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('0ab9f091-24fe-516d-b3d5-5a7e08c6e845', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B9', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('d1477396-98db-5b80-806d-a4de9b226b39', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B10', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('fa8aa463-6b21-5c9e-86df-e9c94500658c', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B11', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('8e376fb2-a5a3-5098-b026-61fb1e4ec0e8', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B12', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('88de3658-3926-5647-98eb-b9401d17c5fc', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B13', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('0efb47b4-eae8-54ee-9a03-910fbba67698', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B14', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('2563d86c-21d1-50d4-a21f-8dbb51d5e622', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B15', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('056e7979-00a8-5b7c-bedc-ad04146648b9', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B16', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('aab36f9c-5ea8-52b6-823a-bb200cf9f6cc', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B17', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('5f6185f5-cfc0-5dfe-8aeb-ef02eeb0f783', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B18', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('a518a7d8-c633-54cd-b843-4ee8b10aad2c', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B19', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('02749709-bc1a-536d-bdac-be1bed28e713', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B20', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('8f5a8c05-35bc-5aab-bfbc-fbaaed3e9620', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B21', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('3bf80f60-3d25-5249-b479-edc9c84ee00e', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B22', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('1bc7eec4-7be1-51b8-900c-42b4c7fedb1c', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B23', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('e777670c-f483-5689-b82b-c786ade771e2', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'B24', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('9e06833f-5dcd-5b0f-8eac-5844a8559c1d', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'BX1', 'Room of 2 MINI', 'STANDARD', 2, 196000, 'ANY', true),
  ('47968f0d-b154-59e7-b352-6761cb36b7f6', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C1', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('a4817349-d87b-5238-8c2e-2a40bfad85b5', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C2', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('75f4035a-29ba-5d58-a1b0-96a4f144f32b', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C3', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('aa4db8b8-20aa-5396-90fe-67683c51a95b', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C4', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('d8ab4272-f6ca-586c-b05a-72aacf50b8d5', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C5', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('790651d1-4eb7-5f31-9ea5-216c596c9986', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C6', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('d4840013-debc-5d0b-9d1c-5a911589c5ee', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C7', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('f7ddb436-d621-55e0-88d4-391bacba171d', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C8', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('c2d94665-9139-58ea-b033-e94a95896309', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C9', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('c357649c-5a15-5d83-b5c3-4ece1594a917', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C10', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('ec0a3bda-6926-5e35-a0be-14d5e972274b', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C11', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('0716b982-169e-569b-9f53-1d7c924d0b3c', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C12', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('73967211-ec86-5446-9fe2-4cca3d9a8212', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C13', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('a0681392-96ca-5cdb-abc9-58ee5f9f9515', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C14', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('2da248b2-7a22-51a0-9df4-269abdc2409f', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C15', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('48f564a9-d36b-53f1-abbb-b398f1b654dd', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C16', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('43064562-686d-50b9-abb4-3f84429fe4a6', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C17', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('b7883a73-1610-5e0d-a514-e129e1c7b5a9', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C18', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('3bbed639-0b16-531f-8377-fca260f29a0a', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C19', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('5c08a198-c643-55e2-b0c8-4ac1b70d939e', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C20', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('a19a4d57-cc0b-5b73-bab2-b1ad063479dc', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C21', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('ee26fc16-b3d7-5f97-88a1-ff96aba9581f', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C22', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('3d6dd136-aff9-5d6d-b498-e454b9c06dfe', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C23', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('2374cf2b-2823-5d1f-9705-53b8936c1311', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'C24', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('9371d014-6a75-5382-9493-b43da86eb577', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D1', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('608ba23a-89af-57ea-aa7b-3df8fbc52c30', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D2', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('c94352cc-dbcc-556e-9a0f-d56797bfab07', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D3', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('238f2259-115f-5bbf-86af-b0229885e1c6', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D4', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('a8e4a3cf-233b-5ce5-ad0d-324194bd2b5b', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D5', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('0d818d63-2e79-588b-9d3a-8c50926ca1c8', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D6', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('c47ca48a-4551-54e3-8029-1fbe90cffb9d', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D7', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('6f751a89-abaa-5511-af63-a689f4d585a8', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D8', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('5a98f45e-3a40-5651-affa-05041b596939', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D9', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('857dc8e0-c9e6-57a9-81b0-470896d52d12', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D10', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('744c2418-3ae9-50a2-933c-f2f5abb11db2', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D11', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('3214b510-4b9c-516b-9842-3c611ed02381', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D12', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('5d05b7d6-c7b7-5cc7-9850-e9f134961bd5', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D13', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('9d6ab318-ed9a-5167-992e-3ee4cdf2bae8', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D14', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('a9c20091-f39f-524e-875e-f9277d9635b3', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D15', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('8062171b-8248-598a-baaa-4bf404ac28ff', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D16', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('a6c0501f-44a8-5828-8179-c7739795fffc', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D17', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('f059e073-dc32-5128-b7e0-620291c822d0', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D18', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('ffece10c-1368-536f-bb28-a75da85cb306', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D19', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('601eff45-fbc4-5b61-8dcc-fce2c6cfe33f', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D20', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('f6d532c7-82d1-53f8-94b2-c7acf65ac4b0', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D21', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('ae88c108-df30-5552-9794-f4b46be27542', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D22', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('bc9f2a90-a48f-558b-b755-a53a7c17de8c', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D23', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('dbbeafc2-acf7-5a09-8b40-e5caf728cfad', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'D24', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('ce1e020c-7fcb-5f80-9244-7a76973c92d5', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E1', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('3b5ce47d-78f9-5143-b9ef-ee6f851c7805', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E2', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('bf186e60-28af-55bc-856b-355d21be8bfc', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E3', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('fe5cfdf3-bdf8-5c37-b4d9-530b19062f74', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E4', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('06948573-723f-58aa-a2f3-64575e7fea02', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E5', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('03702d50-961a-5937-96a1-8306c9f524a7', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E6', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('f4be9893-4e6a-5bac-97d2-a25281f446d1', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E7', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('3ae7e424-68cb-53e9-a1d1-67c4453881fa', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E8', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('25bd92d2-afaa-5c29-8d76-8f77a248af61', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E9', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('7f8b5a76-3d4a-5751-9cc1-f8caf797499b', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E10', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('7c0cdb90-73fd-5b44-9c43-5a2c92b09fed', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E11', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('695cd59e-39ae-5c35-a9df-9a8883aab2a7', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E12', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('5273b2f2-99d8-562f-afc1-18a59f39561b', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E13', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('5c8caebd-a99b-5fe4-a7b4-8c6f55787c14', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E14', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('700dde65-01e0-5c39-ad20-b7170fd8bacb', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E15', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('4c68da61-9226-575b-a244-80978665444e', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E16', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('888fd9da-f770-5b72-9112-7c9a8449b848', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E17', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('f366c7a4-9622-533d-a6c1-bc51c9dee57e', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E18', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('81617486-0ba3-5438-bde2-85f14c9d23f3', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E19', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('7482dff5-6983-5885-bbf7-ad418d7cef5a', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E20', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('417c6956-e414-5d7c-be4c-fcbbb82a754f', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E21', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('af7be078-d33d-5894-91a4-6a7740dba415', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E22', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('5f9c797b-c289-546c-8c9d-790a3f0148f5', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E23', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('a5b152b6-8a66-5b5d-a992-d8d568bc19c5', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'E24', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('1a7ca714-5b74-577e-ba2a-6c81ce211d61', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F1', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('7b2ce1e0-56d1-55a8-ba2e-26a487cc27d0', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F2', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('7febfb8f-c9ac-5adf-a794-d55c45b3bb23', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F3', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('c88cee95-7657-5c44-8177-2f09b4061b13', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F4', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('64c68433-69c2-53c0-a272-677adb39a574', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F5', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('314df261-b8dd-550b-a2c2-e14cfc26ea90', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F6', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('5f0ae213-013f-51d4-b4b5-4e7c622de3e8', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F7', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('e89a4d5d-0583-5806-acc6-579cfe4c550b', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F8', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('cf0645f0-2bd9-5ca6-b53b-b61d59216bb2', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F9', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('012f99b9-6f63-56bf-bebf-a8417e08c325', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F10', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('2682ab69-75ed-55dd-b437-3445ab34d996', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F11', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('71afab85-4f81-5116-a1cb-c2818638ba23', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F12', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('c13104cc-1bdd-5de9-bd8b-95b973421eb6', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F13', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('53cbbd89-0c3c-5e2c-92bf-ccdcf605c570', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F14', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('e70172d2-2a3e-5ead-8268-b634b0442beb', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F15', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('4f462909-b422-5b0d-885d-8bfe19c22de1', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F16', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('15107792-46b8-5c94-8f0c-a0277ffc1a9c', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F17', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('b48377a3-1195-5120-9698-3d5beb48f9bd', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F18', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('3edcf9e7-d83f-5643-a979-d61042ff2afd', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F19', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('ff2738c4-fd85-55ef-a0c4-ec2761c53c41', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F20', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('24306955-438e-5979-b818-58d9753ac1ed', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F21', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('64076d70-cbc9-5f78-93c4-477c0167c125', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F22', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('2fc67b0e-d334-537e-99b6-3521ca02625e', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F23', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('0cab90ef-d8d1-580a-9e20-8d0538024fa9', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'F24', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('0db3615b-bfe1-5425-aa76-d400a76c8d3e', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G1', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('c433e0b3-22a2-5f22-8621-440337e81224', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G2', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('7612d071-74cd-55dd-bebf-60d6d3e29c5b', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G3', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('8a51c172-73c0-5278-8672-3ede3ed0fe2f', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G4', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('ee413459-af94-54e3-92a5-6da08c6b5f61', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G5', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('1d65c83b-a5d0-51bf-bab6-bc2c44fa952a', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G6', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('46bd5020-7ba4-59a2-aaf9-f25f14c385f6', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G7', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('745329d7-a150-5f64-99c5-0558c05a5ba5', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G8', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('e409788c-07a6-51e2-b5e6-a26ed1108a2d', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G9', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('8004af09-9487-57be-a1d5-8e4d9e97aefe', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G10', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('83734b09-cebd-583e-b98b-feaa7e5ba18e', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G11', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('2866a202-2ffc-53d2-b480-fdcabd36661a', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G12', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('5110649c-7d4f-5f7b-83a5-28af05ee5a27', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G13', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('542467db-9a78-51a0-bb96-95d607762a97', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G14', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('4fd18589-8b95-581f-b677-bff35de27de1', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G15', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('3f731c6b-a235-5422-849a-be0e5e4caf3b', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G16', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('7e231e9d-20d8-541d-929a-6d406ab4ffe0', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G17', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('c9be9182-c7b0-5f0e-adb2-31e983f852b3', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G18', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('3e968373-8dee-5999-87af-be3bb88320da', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G19', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('dd8a28c2-13d3-5225-a1c4-3be68fc3e707', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G20', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('393c6d42-236f-5206-b75f-c4f029605ef1', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G21', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('6cb8a9d2-7c70-5e74-b66c-d9e906679e63', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G22', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('019a3010-57c4-5e74-8100-6ea0a6e57870', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G23', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('6249316f-4436-5d14-a07d-ab7b6a7349bd', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'G24', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('cb84d6af-d093-5e63-962d-67e4cd9d9653', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'GX1', 'Room of 2 MINI', 'STANDARD', 2, 196000, 'ANY', true),
  ('d0020712-da0c-5f27-905e-204ab492ee77', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H1', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('8de55eab-1f27-5e58-adaf-9d11c077ca55', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H2', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('ca81809d-e698-5fd4-aaa8-933de59803d2', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H3', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('83c07af8-4375-5312-87de-12378b39daf9', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H4', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('1f49e190-8375-547f-8a86-1c6e532424f7', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H5', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('950548f7-352b-54c2-b00f-08a596a69f07', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H6', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('d0ca8151-cac4-5529-b6ff-2f195bf876ba', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H7', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('12cf8a42-a800-5a58-a72d-f8336f53cce5', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H8', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('94e27820-7cf7-5bb7-a2b7-5addb023d231', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H9', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('fad3f68d-7312-5593-b77f-a5e381e0b9fe', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H10', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('b9204d3e-7fb1-5408-8e42-ea5d9856b7ae', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H11', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('570dbb54-2deb-5fd9-9e14-4b5a3fac9631', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H12', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('1027a0e6-701a-5cdb-b350-cd1a709446ba', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H13', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('d6200de1-d5ea-521c-af4e-b8c5381d6605', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H14', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('6494b30f-0669-5b87-9677-b8d3dc7fbcd1', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H15', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('3632aea3-8a82-5907-bcc9-781e9755d668', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H16', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('8e7e1a48-6017-58d5-be7d-53b1a32bdafa', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H17', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('6a5133fd-4526-52e7-acb9-f6b4466c0b84', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H18', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('846c36cd-c98b-52fe-828a-ea1f3fc73dac', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H19', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('5622b330-7af6-5be2-91e8-b43703fbd22d', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H20', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('23cc19fe-6677-5139-9e55-6de2cef5f38b', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H21', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('536d7b85-c92a-5ae5-a4ca-93987025c88e', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H22', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('f6aa9624-f3e5-5dfc-a1c8-31b2fdaab2d1', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H23', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('3f7aad23-3f8f-51f5-b9d1-85a4a5c1462b', '8ece5d1c-ef02-5613-897c-e0c4924ddc64', 'H24', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('570c2813-0eca-5081-8412-7cd546355348', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'A1', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('3ee628c5-787e-5b23-a1e9-d810caefe33f', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'A2', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('dcf21a41-11ad-5d56-95ab-dc09bb31bf79', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'AX2', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('a03f14ce-c2a8-5b62-b3f0-ffcba9ece065', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'A3', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('72dc6cfb-e8ee-5178-90eb-18f5262b104e', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'AX3', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('6110de40-cefa-5f9d-b0e3-7373612723a6', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'A4', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('c356389e-ae41-552a-b04f-7d476a6c147d', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'A5', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('280fc580-9a25-5109-b696-d11e77016e9d', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'A6', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('5d3603e9-c20d-5ff5-b5ec-1a6d57f893e2', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'A7', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('2146db56-7556-5725-8f7b-e1dee16735e9', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'A8', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('03de2edb-fa92-594d-a7cd-89ae30d20bd7', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'A9', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('a262ce59-4903-5ed0-8290-b360af50fcd9', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'A10', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('6755f157-c228-551c-9766-e200adfd13fc', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'A11', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('f802f337-59ea-51be-ada2-b683538f841f', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'A12', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('29a98d34-b2d0-5b9b-a537-cc18f5504ec3', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'BX1', 'Room of 2', 'STANDARD', 2, 306000, 'ANY', true),
  ('30ad7a91-6ed8-51c2-aa23-02a52ae3c4dd', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'BX2', 'Room of 2', 'STANDARD', 2, 306000, 'ANY', true),
  ('11e58f08-a615-5e69-b17c-a9e45fb735c5', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'BX3', 'Room of 2', 'STANDARD', 2, 306000, 'ANY', true),
  ('fbde52cf-b804-5968-83a7-4f9c6cd7b198', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'BX4', 'Room of 2', 'STANDARD', 2, 306000, 'ANY', true),
  ('bc323a5a-b83b-50dd-a6b3-733c0a2039be', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'BX5', 'Room of 2 MINI', 'STANDARD', 2, 196000, 'ANY', true),
  ('273dcf02-6851-5879-8885-d1ec5fc751c2', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B1', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('c424d44e-81eb-5f35-85e5-c7bd1c196e03', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B2', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('505c142c-44e3-5f8f-8a18-91004bf39336', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B3', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('b5b0ba3d-fdb4-5698-8a06-79875e7d5eb2', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B4', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('5f027a93-bf4a-5f41-9ad3-3d6d3a88897c', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B5', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('5e2a7f88-a4d6-516c-8ee7-c37d5726c84e', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B6', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('03568659-0cf7-5f44-9529-5890525dafd6', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B7', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('da672229-2ff3-5648-9f4e-01c5ee7eefed', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B8', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('c5f6b0a0-ebdb-53d4-8dab-ada0e2e34b14', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B9', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('db943872-338b-5691-a195-5e9165581fb5', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B10', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('a11216a2-a189-5a12-9e2e-cb5aa5b5fae3', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B11', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('93906c9f-4145-5688-af4b-ad4afadbf985', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B12', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('40d184db-f8de-583d-be4e-2035e777abe6', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B13', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('950ed668-2bdd-52af-8b11-06fe6a6ba9db', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B14', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('c74fe48a-da5e-5dd1-8881-a4e718614b9a', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B15', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('1fad1f4f-53c2-557c-994a-c2b95110fb75', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B16', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('e56bc8ba-8fcd-5afa-be39-67b24f858088', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B17', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('5fd47a38-9aab-5826-9ea6-f5c08bf81b61', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B18', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('52bdf113-2051-5fa9-b13a-627fe3cfccc5', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B19', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('449bac61-93ae-55c8-bf99-71dcfd200489', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B20', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('2096387e-e3fe-5f38-a13f-8c571bdb57e0', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B21', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('1922cbd0-0767-5dba-8ead-cf870fc2aafc', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B22', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('2360026e-d86c-59db-be70-c5475f92bca0', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B23', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('73848638-fa4f-5b84-82d7-4fcba9d7e58e', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'B24', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('170a0d1b-ced2-5460-b49e-8f41019c1444', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C1', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('4e9dfc79-a6da-5b9c-aa6f-c4211f368f92', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C2', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('c40c5541-1e41-5d80-a831-57e1467ab2bf', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C3', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('a8fe0c3a-851a-53e4-afd8-320996c2a407', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C4', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('86e1b2a5-2295-5307-b5a4-e15ad8e673ea', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C5', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('bd1a7364-29c6-59de-a116-b113506bd51a', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C6', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('a8485aa2-832b-50c3-ae1f-1a49551ff4b5', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C7', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('baa4a2e4-45c5-5a4d-ab35-862984dab32c', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C8', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('bf1ee10f-149b-5a6f-94fc-7149d9613b3a', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C9', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('d074b522-0589-59a7-9110-12e83f2412b8', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C10', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('f7c33890-3d3a-5f36-85b0-58d82ef5c9ad', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C11', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('45f01314-ee75-5390-a2ca-bc1a1aa90703', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C12', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('134a54f6-3745-58e3-97de-126aee3c8c0a', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C13', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('b85c467f-816d-5012-be7a-164353e6ad46', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C14', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('4af7b16f-3f2d-565e-a31d-75b5b9db8684', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C15', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('bf045375-4042-51c5-8496-df61db9d8476', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C16', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('f11a006b-f4ef-5d74-ba5d-a7bfc7200f74', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C17', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('78e271b7-fbc7-53d8-b111-0cc4aa673733', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C18', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('1916e1f5-c627-5c37-a554-02ecafeae640', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C19', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('d0438ba4-87ba-5900-93a4-00171fdb3101', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C20', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('7ae45c48-3971-5894-b507-05cdd6b65d53', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C21', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('a55879df-f64c-5524-afad-3206cb04d45b', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C22', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('dde193ef-b9ec-5602-a871-6dea38438d9b', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C23', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('5fae5005-e825-5f32-a6a8-791036520c57', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'C24', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('de3adb4d-bbb9-59a3-8e71-47d7d141d93f', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D1', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('db10e5c2-fbcb-5131-866b-8b9d22d0a22d', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D2', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('5f34f688-05d8-5bc7-97fd-03018d11e013', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D3', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('eff2018a-c4b2-5d76-84d4-a9124201fa2a', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D4', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('8ebc2182-77b8-5fb3-befc-de50871b9f02', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D5', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('8a0537dc-2dcb-51fa-8200-3a3cdc4ce9c9', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D6', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('8f57c7be-a5b4-5c4e-85f4-f373778d4587', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D7', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('db791857-2027-53a7-a9f0-a29466770976', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D8', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('b636dc4b-9a88-5431-9e0a-e5f1a1ccb35c', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D9', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('f34d0d1d-1880-5ae3-a6ea-1d5a4903a0f3', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D10', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('45a0bbd1-283e-5e31-b5f6-15099fb5c852', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D11', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('c18a07d4-235f-522e-b8de-f55d7814883f', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D12', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('0c5e7627-bf74-51f7-81e4-9a756d878d78', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D13', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('31370429-325c-51f2-89ca-9c0d9252be46', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D14', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('5deeb71b-2acd-5b00-a861-7c58fec99055', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D15', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('023f2d09-60d6-5435-bd58-840d491ccd2d', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D16', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('e9e99587-bd86-51e6-abd9-d1c5c0e2f28f', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D17', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('0d8ea051-4cd9-5f3f-a033-63af2671d1c5', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D18', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('c72c0af3-284f-5d42-835f-9c0feecfc84a', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D19', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('d1c1c8db-ce2e-56b5-b19a-ecf213af39bb', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D20', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('7f6b9a07-54f4-57f0-ac8a-26e68e5a94a1', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D21', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('8f520c3e-b103-57c2-803c-9ffc4484fa52', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D22', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('5742edff-3eca-5d92-9370-a94bf4b2dfdb', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D23', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('609c6f09-e1ce-55cb-a497-4845e16b2884', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'D24', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('cd198d31-071a-5169-b810-cd0db9627868', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E1', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('97722ade-49df-55c2-ac22-c19b0256e6e9', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E2', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('bbf15863-9774-5f57-9259-8a6c5c566184', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E3', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('b1dfe8a0-e997-5ba1-bac1-e419661aba22', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E4', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('f7276b7e-f4ae-5e73-8b58-2cffb038f5ce', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E5', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('b4ec69fa-b698-563d-b316-ef275ba7a20a', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E6', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('7779b1ba-4d3b-5d20-a49d-8ee7311f34e1', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E7', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('d53275ce-8e11-5d4d-96dd-18ed08024235', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E8', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('056fd4f9-c192-516c-961d-e889f4968702', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E9', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('fafa690f-daf2-5e95-bff1-213030ba9309', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E10', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('c0a99699-c654-5589-923b-a453907be4e2', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E11', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('27c42fd9-9597-5274-a2d9-6c379bca2466', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E12', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('dd76d7ae-53f6-56cf-a685-6314ef4f0bd8', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E13', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('19d698c4-2b7a-5595-bbfc-2b5a57d10eed', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E14', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('e090dfd6-ec23-5457-8b5d-eb04c68997d7', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E15', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('58aeaa35-186a-5719-b28e-c19ba20598c9', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E16', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('8e7d4f0f-05fc-57ec-8617-188acb3a456a', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E17', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('83c6340d-9728-5de4-9613-ce1d2f94542e', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E18', 'Room of 4', 'STANDARD', 4, 255000, 'ANY', true),
  ('4a366eb7-84d3-57cf-9c5f-8178852d6db8', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E19', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('3cf89faf-821f-589f-81ba-6dec1dbe748d', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E20', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('d7f73542-9eb2-5060-aeac-b2f82c334583', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E21', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('04b85360-b4a3-587f-a649-59847925505e', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E22', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('45607ad5-37bd-5dc5-9a13-0ba0eea64f46', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E23', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('cb0f4d85-e9cb-5025-bc42-7c1ff6dd6011', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'E24', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('5c135498-5723-5537-ad35-4f0fba304f8d', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'EX1', 'Room of 2', 'STANDARD', 2, 306000, 'ANY', true),
  ('55e0fc02-52f9-5ac1-aa23-c69936ffcf3c', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'EX2', 'Room of 2', 'STANDARD', 2, 306000, 'ANY', true),
  ('b58b106d-a436-579a-ae0f-05d0202f6fcc', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'EX3', 'Room of 2', 'STANDARD', 2, 306000, 'ANY', true),
  ('b10a45c8-e5df-5037-b544-bf0dc4f49790', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'EX4', 'Room of 2', 'STANDARD', 2, 306000, 'ANY', true),
  ('b0941c1e-f0bd-5f96-9e8a-9d1c70d9b526', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'EX5', 'Room of 2 MINI', 'STANDARD', 2, 196000, 'ANY', true),
  ('ac7ab57e-0fc6-5903-83ed-9c893b1a345e', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'F1', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('da9de31b-ff86-5ae8-8332-903b9c8970af', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'F2', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('b37d2158-862f-5999-9bd6-88e36e0e14c4', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'F3', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('a6e233a8-6e0f-5f1f-8d6e-b10e86b79f6a', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'F4', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('737819fe-84b9-5b19-b405-97768306a3b9', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'F5', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('c69bb7a1-06e6-5397-8436-a1042b4ebb81', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'F6', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('203da707-092f-51c7-aee6-05d2af78976a', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'F7', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('70689e5e-01a4-5f2c-90bc-c8d0c760e4ac', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'F8', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('51824233-0304-58e5-872c-dfcbc4511678', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'F9', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('c9b6051a-045c-5a4a-ab09-60ffd36729d1', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'F10', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('bade7a0f-10a0-5b07-aec4-1342b9f80241', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'F11', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('43fd1e89-4114-508e-82ab-5eb3c48681c0', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'F12', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('d4a38755-48d9-56bc-91d9-22d6530dacbe', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'F13', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('9ad1938e-ba1e-586f-a38b-85780f4deb48', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'F14', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('4bdbe6b0-1905-516e-8fb3-1b56fb2260ae', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'F15', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('88afe71e-34f9-5240-9de6-6c96a1c1ae27', 'cc3fcfa3-01dd-5b95-88ee-850e63847ca9', 'F16', 'Room of 8', 'STANDARD', 8, 190000, 'ANY', true),
  ('29a2cdd7-093a-5151-80e2-1419a86e134f', 'e1eaf912-794d-5b65-b715-438c89225259', 'A1', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('246046e1-35e3-5f4c-8a8d-5781038f3fb4', 'e1eaf912-794d-5b65-b715-438c89225259', 'A2', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('53382ae9-f24b-5599-b352-bd427067a07b', 'e1eaf912-794d-5b65-b715-438c89225259', 'A3', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('e8357677-a8c7-5c08-97ca-70d1b6dfb5fc', 'e1eaf912-794d-5b65-b715-438c89225259', 'A4', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('321ff9ae-6052-5c3c-8e66-82b4263a3944', 'e1eaf912-794d-5b65-b715-438c89225259', 'A5', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('bb0a34a3-35a0-5876-a3e2-a19cdff0d4c6', 'e1eaf912-794d-5b65-b715-438c89225259', 'A6', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('33230ca0-7688-5a17-91d6-c9a867811e0d', 'e1eaf912-794d-5b65-b715-438c89225259', 'A7', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('e7507c22-4b87-577b-97a3-553c3d98380d', 'e1eaf912-794d-5b65-b715-438c89225259', 'A8', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('659adab3-ad58-57be-ba75-f9f1e804c605', 'e1eaf912-794d-5b65-b715-438c89225259', 'A9', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('360055f9-552d-5e64-ac33-3822e75ce455', 'e1eaf912-794d-5b65-b715-438c89225259', 'A10', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('aa1ad200-aa95-5256-81d8-a20dbfeefd37', 'e1eaf912-794d-5b65-b715-438c89225259', 'A11', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('d96da1b1-bfd4-5dfd-81a0-d5c69b5f5650', 'e1eaf912-794d-5b65-b715-438c89225259', 'A12', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('2213eb6f-6fc3-5d5e-b96e-412a43878381', 'e1eaf912-794d-5b65-b715-438c89225259', 'B1', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('75ddeddc-1306-5ef2-9895-f0011e343ed0', 'e1eaf912-794d-5b65-b715-438c89225259', 'B2', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('f1ddf18d-a8d1-5279-b624-23d3a872e179', 'e1eaf912-794d-5b65-b715-438c89225259', 'B3', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('7d9a7e23-6c5a-5a73-8914-1ed735e5ed5b', 'e1eaf912-794d-5b65-b715-438c89225259', 'B4', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('6e073764-7ec6-59cb-a32f-c1a9a0839675', 'e1eaf912-794d-5b65-b715-438c89225259', 'B5', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('7c0a9a31-6421-5ac8-ae52-6c00a1400170', 'e1eaf912-794d-5b65-b715-438c89225259', 'B6', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('811d68d4-04b6-5f25-af8d-9975c4e20f5a', 'e1eaf912-794d-5b65-b715-438c89225259', 'B7', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('6404d6da-97ff-5fce-89e3-601651bc4002', 'e1eaf912-794d-5b65-b715-438c89225259', 'B8', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('bd12784c-dfbc-5272-93b2-7a5668af8c1b', 'e1eaf912-794d-5b65-b715-438c89225259', 'B9', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('19021f37-48c0-5574-bc0f-e9def30c61da', 'e1eaf912-794d-5b65-b715-438c89225259', 'B10', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('7ffdadec-99e9-5f8f-9337-041e5e01a485', 'e1eaf912-794d-5b65-b715-438c89225259', 'B11', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('2ada2154-00f7-576b-b1b7-1227aed967e7', 'e1eaf912-794d-5b65-b715-438c89225259', 'B12', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('b912216f-98a7-5a38-8be5-9e2bd1699071', 'e1eaf912-794d-5b65-b715-438c89225259', 'C1', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('7f17e376-7163-5ecd-9c8f-9a8facfaece5', 'e1eaf912-794d-5b65-b715-438c89225259', 'C2', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('77e33c7a-bf6e-508d-9b15-019e258deeee', 'e1eaf912-794d-5b65-b715-438c89225259', 'C3', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('9aa0d89c-8ef7-5155-b486-8cd225c45de3', 'e1eaf912-794d-5b65-b715-438c89225259', 'C4', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('9a91c0c9-e67f-5f49-9688-b033e1e68b3f', 'e1eaf912-794d-5b65-b715-438c89225259', 'C5', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('81a36a11-4f6e-585a-ae71-d86e35f08adb', 'e1eaf912-794d-5b65-b715-438c89225259', 'C6', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('17a7c318-3069-5f39-bb17-98d4c391c458', 'e1eaf912-794d-5b65-b715-438c89225259', 'C7', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('dac430bf-6f52-58b7-bf50-19e21c222a3a', 'e1eaf912-794d-5b65-b715-438c89225259', 'C8', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('7653e5f2-2239-5d40-ada4-b3f8427ca431', 'e1eaf912-794d-5b65-b715-438c89225259', 'C9', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('1677a779-9a6e-5a8e-a022-725c49007a60', 'e1eaf912-794d-5b65-b715-438c89225259', 'C10', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('d9c77ce2-cf58-5783-a0d4-ad6259f49954', 'e1eaf912-794d-5b65-b715-438c89225259', 'C11', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('ffc8ec92-8e19-5b9e-bd32-c37f39f5fcf7', 'e1eaf912-794d-5b65-b715-438c89225259', 'C12', 'Room of 3', 'PRIVATE', 3, 285000, 'MALE', true),
  ('aec45b44-c07c-5e23-9555-86dd08d34a89', 'e1eaf912-794d-5b65-b715-438c89225259', 'D1', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('130ae1b5-31ef-58f7-8d7d-b9276e0db064', 'e1eaf912-794d-5b65-b715-438c89225259', 'D2', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('0446e5de-e68f-51d7-bfa3-aa749a0cdacc', 'e1eaf912-794d-5b65-b715-438c89225259', 'D3', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('fa083dbe-73ad-5185-a3eb-70f5e64759bf', 'e1eaf912-794d-5b65-b715-438c89225259', 'D4', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('372d18ab-fcf4-5c8a-aa25-1a05bc5dec70', 'e1eaf912-794d-5b65-b715-438c89225259', 'D5', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('3944ddbd-8831-5f4d-999c-60042ed1dcb6', 'e1eaf912-794d-5b65-b715-438c89225259', 'D6', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('c968f5f0-ea08-5722-8fba-6c5acd1d46f8', 'e1eaf912-794d-5b65-b715-438c89225259', 'D7', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('307b59f7-48bf-5399-9f24-8c1ebf0f1d44', 'e1eaf912-794d-5b65-b715-438c89225259', 'D8', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('570062e3-b222-54dd-bd36-9b9e28aa54fe', 'e1eaf912-794d-5b65-b715-438c89225259', 'D9', 'Room of 2', 'PRIVATE', 2, 326000, 'MALE', true),
  ('766e8bf8-bcc7-5412-b4f4-88898c08296e', 'e1eaf912-794d-5b65-b715-438c89225259', 'D10', 'Room of 3', 'PRIVATE', 3, 285000, 'MALE', true),
  ('798731ca-95f6-5bdf-a97a-b220fc257a6c', 'e1eaf912-794d-5b65-b715-438c89225259', '1', 'Room of 2', 'PUBLIC', 2, 271000, 'MALE', true),
  ('2aaaa166-c505-5d02-b955-ec227ff23641', 'e1eaf912-794d-5b65-b715-438c89225259', '2', 'Room of 2', 'PUBLIC', 2, 271000, 'MALE', true),
  ('e00a1818-7356-5770-8421-7f840acf80ae', 'e1eaf912-794d-5b65-b715-438c89225259', '3', 'Room of 2', 'PUBLIC', 2, 271000, 'MALE', true),
  ('7786dbef-c64b-518a-a56a-c6326b9405cd', 'e1eaf912-794d-5b65-b715-438c89225259', '4', 'Room of 2', 'PUBLIC', 2, 271000, 'MALE', true),
  ('6b314e4e-8499-5f3d-998f-b395593d385c', 'e1eaf912-794d-5b65-b715-438c89225259', '5', 'Room of 2', 'PUBLIC', 2, 271000, 'MALE', true),
  ('8b58185a-8f12-5fec-8026-6460b3d191a8', 'e1eaf912-794d-5b65-b715-438c89225259', '6', 'Room of 2', 'PUBLIC', 2, 271000, 'MALE', true),
  ('9a98b138-57c1-5866-a05c-a9760261d5ad', 'e1eaf912-794d-5b65-b715-438c89225259', '7', 'Room of 2', 'PUBLIC', 2, 271000, 'MALE', true),
  ('a944e772-feb0-5fb5-b2f9-8a0b6cb326fe', 'e1eaf912-794d-5b65-b715-438c89225259', '8', 'Room of 2', 'PUBLIC', 2, 271000, 'MALE', true),
  ('9a069d34-b9e8-5562-8478-acb3567c8a22', 'e1eaf912-794d-5b65-b715-438c89225259', '9', 'Room of 2', 'PUBLIC', 2, 271000, 'MALE', true),
  ('62182b41-054d-5bd0-a171-7d52cd7a9f85', 'e1eaf912-794d-5b65-b715-438c89225259', '10', 'Room of 2', 'PUBLIC', 2, 271000, 'MALE', true),
  ('b07c3e8d-f6da-5d81-96b0-9bd7dbf2653c', 'e1eaf912-794d-5b65-b715-438c89225259', '11', 'Room of 2', 'PUBLIC', 2, 271000, 'MALE', true),
  ('6e9e64f4-528e-58b8-90f0-f7b1bfb3bfe0', 'e1eaf912-794d-5b65-b715-438c89225259', '12', 'Room of 2', 'PUBLIC', 2, 271000, 'MALE', true),
  ('6d4ab019-1a17-5c05-ab93-b793317c36e2', 'e1eaf912-794d-5b65-b715-438c89225259', '13', 'Room of 2', 'PUBLIC', 2, 271000, 'FEMALE', true),
  ('ced7ca42-fff2-5bdf-af55-a6b9e890f61d', 'e1eaf912-794d-5b65-b715-438c89225259', '14', 'Room of 2', 'PUBLIC', 2, 271000, 'FEMALE', true),
  ('7a5a4738-f2ae-5c0a-8371-2aef9eb27458', 'e1eaf912-794d-5b65-b715-438c89225259', '15', 'Room of 2', 'PUBLIC', 2, 271000, 'FEMALE', true),
  ('4a3e62e7-945c-5cce-bcca-4a633ac49f0c', 'e1eaf912-794d-5b65-b715-438c89225259', '16', 'Room of 2', 'PUBLIC', 2, 271000, 'FEMALE', true),
  ('57d2ca56-7688-5527-8d92-f592674c1bf4', 'e1eaf912-794d-5b65-b715-438c89225259', '17', 'Room of 2', 'PUBLIC', 2, 271000, 'FEMALE', true),
  ('442951b8-7813-5094-8537-d553e3319047', 'e1eaf912-794d-5b65-b715-438c89225259', '18', 'Room of 2', 'PUBLIC', 2, 271000, 'FEMALE', true),
  ('7c434afd-d391-5858-95a8-1f89c3da1115', 'e1eaf912-794d-5b65-b715-438c89225259', '19', 'Room of 2', 'PUBLIC', 2, 271000, 'FEMALE', true),
  ('7c6f6e56-7173-5caf-bc4b-4677085d91cb', 'e1eaf912-794d-5b65-b715-438c89225259', '20', 'Room of 2', 'PUBLIC', 2, 271000, 'FEMALE', true),
  ('10dc8097-6253-5b7f-81bf-8ea194c43cc8', 'e1eaf912-794d-5b65-b715-438c89225259', '21', 'Room of 2', 'PUBLIC', 2, 271000, 'FEMALE', true),
  ('96a7ced9-2be0-53cd-ac31-b1eeece87210', 'e1eaf912-794d-5b65-b715-438c89225259', '22', 'Room of 2', 'PUBLIC', 2, 271000, 'FEMALE', true),
  ('312379f5-3f6d-543b-b394-e7e97e1da6f3', 'e1eaf912-794d-5b65-b715-438c89225259', '23', 'Room of 2', 'PUBLIC', 2, 271000, 'FEMALE', true),
  ('07ce0ec4-0b31-5da7-a16b-2be12cf9fe29', 'e1eaf912-794d-5b65-b715-438c89225259', '24', 'Room of 2', 'PUBLIC', 2, 271000, 'FEMALE', true);
