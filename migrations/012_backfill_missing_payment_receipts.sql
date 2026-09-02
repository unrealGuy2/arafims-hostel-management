begin;

update public.payments p
set amount_paid = p.amount_expected,
    updated_at = timezone('utc'::text, now())
where p.payment_status = 'confirmed'
  and p.amount_paid is null
  and p.verified_by is not null
  and p.verified_at is not null
  and not exists (
    select 1
    from public.payment_receipts pr
    where pr.payment_id = p.id
  );

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
  p.id,
  'AHM-' || to_char(p.verified_at, 'YYYY') || '-' ||
    lpad(nextval('public.payment_receipt_number_seq')::text, 6, '0'),
  p.verified_at,
  sp.full_name,
  sp.matric_number,
  sp.email,
  sp.level,
  sp.department,
  sp.faculty,
  sp.gender,
  h.name,
  r.room_number,
  r.room_type,
  p.amount_paid,
  'Bank Transfer',
  p.payment_reference,
  'confirmed',
  p.verified_by,
  p.verified_at
from public.payments p
join public.reservations res on res.id = p.reservation_id
join public.student_profiles sp on sp.id = res.student_profile_id
join public.rooms r on r.id = res.room_id
join public.hostels h on h.id = r.hostel_id
where p.payment_status = 'confirmed'
  and p.verified_by is not null
  and p.verified_at is not null
  and not exists (
    select 1
    from public.payment_receipts pr
    where pr.payment_id = p.id
  )
on conflict (payment_id) do nothing;

commit;
