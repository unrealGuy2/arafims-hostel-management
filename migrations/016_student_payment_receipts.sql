alter table public.payments
  add column if not exists payment_receipt_path text;

insert into storage.buckets (id, name, public)
values ('payment_receipts', 'payment_receipts', false)
on conflict (id) do update set public = false;

drop policy if exists "Students can upload own payment receipts" on storage.objects;
create policy "Students can upload own payment receipts"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'payment_receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Students can read own payment receipts" on storage.objects;
create policy "Students can read own payment receipts"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'payment_receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Students can update own payment receipts" on storage.objects;
create policy "Students can update own payment receipts"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'payment_receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'payment_receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create or replace function public.manager_can_read_payment_receipt(p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  payment_id uuid;
begin
  if public.current_user_role() <> 'manager'
    or p_path !~ '^[0-9a-fA-F-]+/[0-9a-fA-F-]+/[^/]+$' then
    return false;
  end if;

  begin
    payment_id := split_part(p_path, '/', 2)::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return exists (
    select 1
    from public.payments p
    join public.reservations res on res.id = p.reservation_id
    join public.rooms r on r.id = res.room_id
    join public.hostel_managers hm on hm.hostel_id = r.hostel_id
    where p.id = payment_id
      and p.payment_receipt_path = p_path
      and hm.user_id = auth.uid()
  );
end;
$$;

revoke all on function public.manager_can_read_payment_receipt(text) from public;
grant execute on function public.manager_can_read_payment_receipt(text) to authenticated;

drop policy if exists "Managers can read assigned payment receipts" on storage.objects;
create policy "Managers can read assigned payment receipts"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'payment_receipts'
    and public.manager_can_read_payment_receipt(name)
  );

create or replace function public.set_student_payment_receipt(
  p_payment_id uuid,
  p_path text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_path !~ ('^' || auth.uid()::text || '/' || p_payment_id::text || '/[^/]+$') then
    return false;
  end if;

  update public.payments p
  set payment_receipt_path = p_path,
      updated_at = timezone('utc'::text, now())
  from public.reservations res
  join public.student_profiles sp on sp.id = res.student_profile_id
  where p.id = p_payment_id
    and p.reservation_id = res.id
    and sp.user_id = auth.uid();

  return found;
end;
$$;

revoke all on function public.set_student_payment_receipt(uuid, text) from public;
grant execute on function public.set_student_payment_receipt(uuid, text) to authenticated;

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
      or new.submitted_at is distinct from old.submitted_at then
      raise exception 'Students may only submit payment proof or payment receipt';
    end if;

    if new.payment_status = 'proof_submitted'
      and (new.payment_proof_path is null or new.submitted_at is null) then
      raise exception 'Payment proof is required';
    end if;
  end if;

  return new;
end;
$$;
