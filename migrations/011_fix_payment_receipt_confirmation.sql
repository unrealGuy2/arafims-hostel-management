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
  hostel_name_value text;
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

  select name into hostel_name_value
  from public.hostels
  where id = room_record.hostel_id;

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

  if payment_record.payment_status <> 'confirmed'
    or payment_record.verified_at is null
    or payment_record.verified_by is null then
    raise exception 'Payment confirmation failed';
  end if;

  if not exists (
    select 1
    from public.payment_receipts
    where payment_id = payment_record.id
  ) then
    receipt_number_value := 'AHM-' || to_char(payment_record.verified_at, 'YYYY') || '-' ||
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
    values (
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
      hostel_name_value,
      room_record.room_number,
      room_record.room_type,
      payment_record.amount_paid,
      'Bank Transfer',
      payment_record.payment_reference,
      payment_record.payment_status,
      payment_record.verified_by,
      payment_record.verified_at
    );
  end if;

  return payment_record;
end;
$$;

revoke all on function public.manager_confirm_payment(uuid) from public;
grant execute on function public.manager_confirm_payment(uuid) to authenticated;
