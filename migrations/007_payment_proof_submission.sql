insert into storage.buckets (id, name, public)
values ('payment_proofs', 'payment_proofs', false)
on conflict (id) do update set public = false;

drop policy if exists "Students can upload own payment proofs" on storage.objects;
create policy "Students can upload own payment proofs"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'payment_proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Students can read own payment proofs" on storage.objects;
create policy "Students can read own payment proofs"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'payment_proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Students can update own payment proofs" on storage.objects;
create policy "Students can update own payment proofs"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'payment_proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'payment_proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

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
      or new.payment_status <> 'proof_submitted' then
      raise exception 'Students may only submit payment proof';
    end if;

    if new.payment_status = 'proof_submitted'
      and (new.payment_proof_path is null or new.submitted_at is null) then
      raise exception 'Payment proof is required';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_student_payment_proof_update on public.payments;
create trigger validate_student_payment_proof_update
before update on public.payments
for each row execute function public.validate_student_payment_proof_update();

revoke all on function public.validate_student_payment_proof_update() from public;
