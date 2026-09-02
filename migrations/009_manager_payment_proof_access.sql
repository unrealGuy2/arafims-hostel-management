create or replace function public.manager_can_read_payment_proof(p_path text)
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
      and p.payment_proof_path = p_path
      and hm.user_id = auth.uid()
  );
end;
$$;

revoke all on function public.manager_can_read_payment_proof(text) from public;
grant execute on function public.manager_can_read_payment_proof(text) to authenticated;

drop policy if exists "Managers can read assigned payment proofs" on storage.objects;
create policy "Managers can read assigned payment proofs"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'payment_proofs'
    and public.manager_can_read_payment_proof(name)
  );
