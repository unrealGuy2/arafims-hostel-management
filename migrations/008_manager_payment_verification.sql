create or replace function public.manager_confirm_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_record public.payments%rowtype;
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

  update public.payments
  set payment_status = 'confirmed',
      verified_by = auth.uid(),
      verified_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where id = p_payment_id
  returning * into payment_record;

  return payment_record;
end;
$$;

create or replace function public.manager_reject_payment(p_payment_id uuid, p_rejection_reason text)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_record public.payments%rowtype;
begin
  if nullif(trim(p_rejection_reason), '') is null then
    raise exception 'Rejection reason is required';
  end if;

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

  update public.payments
  set payment_status = 'rejected',
      rejection_reason = trim(p_rejection_reason),
      verified_by = auth.uid(),
      verified_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where id = p_payment_id
  returning * into payment_record;

  return payment_record;
end;
$$;

revoke all on function public.manager_confirm_payment(uuid) from public;
revoke all on function public.manager_reject_payment(uuid, text) from public;
grant execute on function public.manager_confirm_payment(uuid) to authenticated;
grant execute on function public.manager_reject_payment(uuid, text) to authenticated;
