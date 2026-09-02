create sequence if not exists public.payment_receipt_number_seq;

create table if not exists public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id) on delete restrict,
  receipt_number text not null unique,
  receipt_date timestamptz not null default timezone('utc'::text, now()),
  student_full_name text not null,
  matric_number text not null,
  email text not null,
  level integer not null,
  department text not null,
  faculty text not null,
  gender text not null,
  hostel_name text not null,
  room_number text not null,
  room_type text not null,
  amount_paid numeric(12, 2) not null check (amount_paid >= 0),
  payment_method text not null,
  payment_reference text,
  payment_status text not null check (payment_status = 'confirmed'),
  verified_by uuid not null references auth.users(id) on delete restrict,
  verified_at timestamptz not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.payment_receipts enable row level security;

drop policy if exists "Students can read own receipts" on public.payment_receipts;
create policy "Students can read own receipts"
  on public.payment_receipts
  for select
  using (
    exists (
      select 1
      from public.payments p
      join public.reservations res on res.id = p.reservation_id
      join public.student_profiles sp on sp.id = res.student_profile_id
      where p.id = payment_receipts.payment_id
        and sp.user_id = auth.uid()
    )
  );

drop policy if exists "Managers can read assigned receipts" on public.payment_receipts;
create policy "Managers can read assigned receipts"
  on public.payment_receipts
  for select
  using (
    exists (
      select 1
      from public.payments p
      join public.reservations res on res.id = p.reservation_id
      join public.rooms r on r.id = res.room_id
      where p.id = payment_receipts.payment_id
        and public.user_can_access_hostel(r.hostel_id)
    )
  );

drop policy if exists "Master admins can read all receipts" on public.payment_receipts;
create policy "Master admins can read all receipts"
  on public.payment_receipts
  for select
  using (public.current_user_role() = 'master_admin');

drop policy if exists "Users cannot insert receipts directly" on public.payment_receipts;
create policy "Users cannot insert receipts directly"
  on public.payment_receipts
  for insert
  with check (false);

drop policy if exists "Users cannot update receipts" on public.payment_receipts;
create policy "Users cannot update receipts"
  on public.payment_receipts
  for update
  using (false)
  with check (false);

drop policy if exists "Users cannot delete receipts" on public.payment_receipts;
create policy "Users cannot delete receipts"
  on public.payment_receipts
  for delete
  using (false);

create or replace function public.manager_confirm_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_record public.payments%rowtype;
  reservation_record public.reservations%rowtype;
  room_record public.rooms%rowtype;
  profile_record public.student_profiles%rowtype;
  receipt_number_value text;
begin
  select p.* into payment_record
  from public.payments p
  join public.reservations res on res.id = p.reservation_id
  join public.rooms r on r.id = res.room_id
  join public.hostel_managers hm on hm.hostel_id = r.hostel_id
  where p.id = p_payment_id
    and hm.user_id = auth.uid()
  for update;

  if payment_record.id is null then
    raise exception 'Payment not found or not authorized';
  end if;

  if payment_record.payment_status <> 'proof_submitted' then
    raise exception 'Payment proof is not awaiting verification';
  end if;

  select * into reservation_record
  from public.reservations
  where id = payment_record.reservation_id;

  select * into room_record
  from public.rooms
  where id = reservation_record.room_id;

  select * into profile_record
  from public.student_profiles
  where id = reservation_record.student_profile_id;

  update public.payments
  set payment_status = 'confirmed',
      amount_paid = coalesce(amount_paid, amount_expected),
      verified_by = auth.uid(),
      verified_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where id = p_payment_id
  returning * into payment_record;

  receipt_number_value := 'AHM-' || to_char(timezone('utc'::text, now()), 'YYYY') || '-' ||
    lpad(nextval('public.payment_receipt_number_seq')::text, 6, '0');

  insert into public.payment_receipts (
    payment_id,
    receipt_number,
    receipt_date,
    student_full_name,
    matric_number,
    email,
    level,
    department,
    faculty,
    gender,
    hostel_name,
    room_number,
    room_type,
    amount_paid,
    payment_method,
    payment_reference,
    payment_status,
    verified_by,
    verified_at
  )
  select
    payment_record.id,
    receipt_number_value,
    payment_record.verified_at,
    profile_record.full_name,
    profile_record.matric_number,
    profile_record.email,
    profile_record.level,
    profile_record.department,
    profile_record.faculty,
    profile_record.gender,
    h.name,
    room_record.room_number,
    room_record.room_type,
    payment_record.amount_paid,
    'Bank Transfer',
    payment_record.payment_reference,
    payment_record.payment_status,
    payment_record.verified_by,
    payment_record.verified_at
  from public.hostels h
  where h.id = room_record.hostel_id
  on conflict (payment_id) do nothing;

  return payment_record;
end;
$$;

revoke all on function public.manager_confirm_payment(uuid) from public;
grant execute on function public.manager_confirm_payment(uuid) to authenticated;
