create table if not exists public.payment_accounts (
  id uuid primary key default gen_random_uuid(),
  hostel_id uuid not null references public.hostels(id) on delete cascade,
  room_type text,
  section text,
  bank_name text not null,
  account_name text not null,
  account_number text not null,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_payment_accounts_hostel_id
  on public.payment_accounts(hostel_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.reservations(id) on delete cascade,
  payment_account_id uuid references public.payment_accounts(id) on delete restrict,
  amount_expected numeric(12, 2) not null check (amount_expected >= 0),
  amount_paid numeric(12, 2) check (amount_paid is null or amount_paid >= 0),
  payment_status text not null default 'payment_pending'
    check (payment_status in ('payment_pending', 'proof_submitted', 'confirmed', 'rejected')),
  payment_proof_path text,
  payment_reference text,
  submitted_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  rejection_reason text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  check (
    payment_status <> 'confirmed'
    or (verified_at is not null and verified_by is not null)
  ),
  check (
    payment_status <> 'proof_submitted'
    or submitted_at is not null
  )
);

create index if not exists idx_payments_reservation_id
  on public.payments(reservation_id);
create index if not exists idx_payments_status
  on public.payments(payment_status);

alter table public.payment_accounts enable row level security;
alter table public.payments enable row level security;

drop policy if exists "Users can read applicable payment accounts" on public.payment_accounts;
create policy "Users can read applicable payment accounts"
  on public.payment_accounts
  for select
  using (
    auth.uid() is not null
    and (
      public.current_user_role() = 'master_admin'
      or public.current_user_role() = 'manager'
      or exists (
        select 1
        from public.reservations res
        join public.rooms r on r.id = res.room_id
        where res.student_profile_id in (
          select sp.id
          from public.student_profiles sp
          where sp.user_id = auth.uid()
        )
          and r.hostel_id = payment_accounts.hostel_id
          and res.status = 'approved'
      )
    )
  );

drop policy if exists "Users can read their scoped payments" on public.payments;
create policy "Users can read their scoped payments"
  on public.payments
  for select
  using (
    exists (
      select 1
      from public.reservations res
      where res.id = payments.reservation_id
        and res.student_profile_id in (
          select sp.id
          from public.student_profiles sp
          where sp.user_id = auth.uid()
        )
    )
    or public.user_can_access_hostel(
      (select r.hostel_id
       from public.reservations res
       join public.rooms r on r.id = res.room_id
       where res.id = payments.reservation_id)
    )
  );

drop policy if exists "Students can submit payment proof" on public.payments;
create policy "Students can submit payment proof"
  on public.payments
  for update
  using (
    exists (
      select 1
      from public.reservations res
      join public.student_profiles sp on sp.id = res.student_profile_id
      where res.id = payments.reservation_id
        and sp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.reservations res
      join public.student_profiles sp on sp.id = res.student_profile_id
      where res.id = payments.reservation_id
        and sp.user_id = auth.uid()
    )
  );

drop policy if exists "Master admins can update payments" on public.payments;
create policy "Master admins can update payments"
  on public.payments
  for update
  using (public.current_user_role() = 'master_admin')
  with check (public.current_user_role() = 'master_admin');

drop policy if exists "Users cannot insert payments directly" on public.payments;
create policy "Users cannot insert payments directly"
  on public.payments
  for insert
  with check (false);

drop policy if exists "Users cannot delete payments" on public.payments;
create policy "Users cannot delete payments"
  on public.payments
  for delete
  using (false);

create or replace function public.prevent_student_payment_confirmation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.current_user_role() = 'student'
    and (
      new.payment_status = 'confirmed'
      or new.verified_at is distinct from old.verified_at
      or new.verified_by is distinct from old.verified_by
    ) then
    raise exception 'Students cannot confirm payments';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_student_payment_confirmation on public.payments;
create trigger prevent_student_payment_confirmation
before update on public.payments
for each row execute function public.prevent_student_payment_confirmation();

create or replace function public.create_payment_for_approved_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  room_record public.rooms%rowtype;
  account_record public.payment_accounts%rowtype;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    select * into room_record
    from public.rooms
    where id = new.room_id;

    select * into account_record
    from public.payment_accounts
    where hostel_id = room_record.hostel_id
      and active = true
      and (room_type is null or room_type = room_record.room_type)
      and (section is null or section = room_record.room_category)
    order by
      (case when room_type is not null then 1 else 0 end
       + case when section is not null then 1 else 0 end) desc
    limit 1;

    if account_record.id is null then
      raise exception 'No active payment account configured for this room';
    end if;

    insert into public.payments (
      reservation_id,
      payment_account_id,
      amount_expected,
      payment_status
    )
    values (
      new.id,
      account_record.id,
      new.room_price,
      'payment_pending'
    )
    on conflict (reservation_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists create_payment_for_approved_reservation on public.reservations;
create trigger create_payment_for_approved_reservation
after update of status on public.reservations
for each row execute function public.create_payment_for_approved_reservation();

insert into public.payment_accounts (
  hostel_id, room_type, section, bank_name, account_name, account_number
)
select id, null, null, 'JAIZ', 'ARAFIMS GLOBAL INVESTMENT SERVICES LTD.', '0003215739'
from public.hostels where slug = 'arafims-1'
on conflict do nothing;

insert into public.payment_accounts (
  hostel_id, room_type, section, bank_name, account_name, account_number
)
select id, 'Room of 4', null, 'JAIZ', 'ARAFIMS ENGINEERING NIG. LTD.', '0018289666'
from public.hostels where slug = 'arafims-2'
on conflict do nothing;

insert into public.payment_accounts (
  hostel_id, room_type, section, bank_name, account_name, account_number
)
select id, null, null, 'MONIEPOINT MFB', 'AL-ADNAN OPTIMAL ENTERPRISE', '6560831411'
from public.hostels where slug = 'arafims-2'
on conflict do nothing;

insert into public.payment_accounts (
  hostel_id, room_type, section, bank_name, account_name, account_number
)
select id, null, 'PRIVATE', 'MONIEPOINT MFB', 'AL- MUHAYMIN ETHICAL VENTURES', '5295270098'
from public.hostels where slug = 'zamfara-pg'
on conflict do nothing;

insert into public.payment_accounts (
  hostel_id, room_type, section, bank_name, account_name, account_number
)
select id, null, 'PUBLIC', 'MONIEPOINT MFB', 'RAW D_LITE VENTURES', '6846292237'
from public.hostels where slug = 'zamfara-pg'
on conflict do nothing;

insert into public.payments (
  reservation_id,
  payment_account_id,
  amount_expected,
  payment_status
)
select
  res.id,
  account.id,
  res.room_price,
  'payment_pending'
from public.reservations res
join public.rooms room on room.id = res.room_id
join lateral (
  select pa.id
  from public.payment_accounts pa
  where pa.hostel_id = room.hostel_id
    and pa.active = true
    and (pa.room_type is null or pa.room_type = room.room_type)
    and (pa.section is null or pa.section = room.room_category)
  order by
    (case when pa.room_type is not null then 1 else 0 end
     + case when pa.section is not null then 1 else 0 end) desc
  limit 1
) account on true
where res.status = 'approved'
on conflict (reservation_id) do nothing;

revoke all on function public.prevent_student_payment_confirmation() from public;
revoke all on function public.create_payment_for_approved_reservation() from public;
