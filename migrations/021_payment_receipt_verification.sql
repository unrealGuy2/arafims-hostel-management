alter table public.payments
  add column if not exists payment_receipt_status text not null default 'not_required'
  check (payment_receipt_status in ('not_required', 'required', 'submitted', 'approved', 'rejected'));

update public.payments
set payment_receipt_status = case
  when payment_status <> 'confirmed' then 'not_required'
  when payment_receipt_path is not null then 'submitted'
  else 'required'
end
where payment_receipt_status = 'not_required';

create or replace function public.manager_confirm_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
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
  where p.id = p_payment_id
    and public.current_user_role() in ('manager', 'master_admin')
    and public.user_can_access_hostel(r.hostel_id)
  for update;

  if payment_record.id is null then
    raise exception 'Payment not found or not authorized';
  end if;

  if payment_record.payment_status <> 'proof_submitted' then
    raise exception 'Payment proof is not awaiting verification';
  end if;

  select * into reservation_record from public.reservations where id = payment_record.reservation_id;
  select * into room_record from public.rooms where id = reservation_record.room_id;
  select * into profile_record from public.student_profiles where id = reservation_record.student_profile_id;

  update public.payments
  set payment_status = 'confirmed',
      payment_receipt_status = 'required',
      amount_paid = coalesce(amount_paid, amount_expected),
      verified_by = auth.uid(),
      verified_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where id = p_payment_id
  returning * into payment_record;

  receipt_number_value := 'AHM-' || pg_catalog.to_char(pg_catalog.timezone('utc'::text, pg_catalog.now()), 'YYYY') || '-' ||
    pg_catalog.lpad(pg_catalog.nextval('public.payment_receipt_number_seq')::text, 6, '0');

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

create or replace function public.manager_reject_payment(
  p_payment_id uuid,
  p_rejection_reason text
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_record public.payments%rowtype;
begin
  if pg_catalog.nullif(pg_catalog.trim(p_rejection_reason), '') is null then
    raise exception 'Rejection reason is required';
  end if;

  select p.* into payment_record
  from public.payments p
  join public.reservations res on res.id = p.reservation_id
  join public.rooms r on r.id = res.room_id
  where p.id = p_payment_id
    and public.current_user_role() in ('manager', 'master_admin')
    and public.user_can_access_hostel(r.hostel_id)
  for update;

  if payment_record.id is null then
    raise exception 'Payment not found or not authorized';
  end if;

  if payment_record.payment_status <> 'proof_submitted' then
    raise exception 'Payment proof is not awaiting verification';
  end if;

  update public.payments
  set payment_status = 'rejected',
      rejection_reason = pg_catalog.trim(p_rejection_reason),
      verified_by = auth.uid(),
      verified_at = pg_catalog.timezone('utc'::text, pg_catalog.now()),
      updated_at = pg_catalog.timezone('utc'::text, pg_catalog.now())
  where id = p_payment_id
  returning * into payment_record;

  return payment_record;
end;
$$;

create or replace function public.set_student_payment_receipt(
  p_payment_id uuid,
  p_path text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_path !~ ('^' || auth.uid()::text || '/' || p_payment_id::text || '/[^/]+$') then
    return false;
  end if;

  update public.payments p
  set payment_receipt_path = p_path,
      payment_receipt_status = 'submitted',
      updated_at = timezone('utc'::text, now())
  from public.reservations res
  join public.student_profiles sp on sp.id = res.student_profile_id
  where p.id = p_payment_id
    and p.reservation_id = res.id
    and p.payment_status = 'confirmed'
    and p.payment_receipt_status in ('required', 'rejected')
    and sp.user_id = auth.uid();

  return found;
end;
$$;

create or replace function public.manager_review_payment_receipt(
  p_payment_id uuid,
  p_action text
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_record public.payments%rowtype;
begin
  if p_action not in ('approve', 'reject') then
    raise exception 'Invalid receipt review action';
  end if;

  select p.* into payment_record
  from public.payments p
  join public.reservations res on res.id = p.reservation_id
  join public.rooms r on r.id = res.room_id
  where p.id = p_payment_id
    and public.current_user_role() in ('manager', 'master_admin')
    and public.user_can_access_hostel(r.hostel_id)
  for update;

  if payment_record.id is null or payment_record.payment_status <> 'confirmed'
    or payment_record.payment_receipt_path is null
    or payment_record.payment_receipt_status <> 'submitted' then
    raise exception 'Payment receipt is not awaiting verification';
  end if;

  update public.payments
  set payment_receipt_status = case when p_action = 'approve' then 'approved' else 'rejected' end,
      updated_at = timezone('utc'::text, now())
  where id = p_payment_id
  returning * into payment_record;

  return payment_record;
end;
$$;

revoke all on function public.manager_confirm_payment(uuid) from public, anon;
revoke all on function public.manager_reject_payment(uuid, text) from public, anon;
revoke all on function public.set_student_payment_receipt(uuid, text) from public, anon;
revoke all on function public.manager_review_payment_receipt(uuid, text) from public, anon;
grant execute on function public.manager_confirm_payment(uuid) to authenticated;
grant execute on function public.manager_reject_payment(uuid, text) to authenticated;
grant execute on function public.set_student_payment_receipt(uuid, text) to authenticated;
grant execute on function public.manager_review_payment_receipt(uuid, text) to authenticated;

create or replace function public.validate_student_payment_proof_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.current_user_role() = 'student' then
    if new.reservation_id is distinct from old.reservation_id
      or new.payment_account_id is distinct from old.payment_account_id
      or new.amount_expected is distinct from old.amount_expected
      or new.amount_paid is distinct from old.amount_paid
      or new.verified_at is distinct from old.verified_at
      or new.verified_by is distinct from old.verified_by
      or new.rejection_reason is distinct from old.rejection_reason
      or new.created_at is distinct from old.created_at
      or new.payment_status <> old.payment_status
      or new.payment_proof_path is distinct from old.payment_proof_path
      or new.payment_reference is distinct from old.payment_reference
      or new.submitted_at is distinct from old.submitted_at
      or (
        new.payment_receipt_path is distinct from old.payment_receipt_path
        and not (
          new.payment_receipt_path ~ ('^' || auth.uid()::text || '/' || new.id::text || '/[^/]+$')
          and new.payment_receipt_status = 'submitted'
          and old.payment_receipt_status in ('required', 'rejected')
        )
      )
      or (
        new.payment_receipt_status is distinct from old.payment_receipt_status
        and not (
          new.payment_receipt_status = 'submitted'
          and old.payment_receipt_status in ('required', 'rejected')
          and new.payment_receipt_path is not null
        )
      ) then
      raise exception 'Students may only submit payment proof or payment receipt';
    end if;
  end if;

  return new;
end;
$$;
