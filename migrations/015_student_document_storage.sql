alter table public.student_profiles
  add column if not exists passport_photo_path text,
  add column if not exists school_id_path text;

insert into storage.buckets (id, name, public)
values
  ('passport_photos', 'passport_photos', false),
  ('school_ids', 'school_ids', false)
on conflict (id) do update set public = false;

drop policy if exists "Students can upload own passport photos" on storage.objects;
create policy "Students can upload own passport photos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'passport_photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Students can read own passport photos" on storage.objects;
create policy "Students can read own passport photos"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'passport_photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Students can update own passport photos" on storage.objects;
create policy "Students can update own passport photos"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'passport_photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'passport_photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Students can delete own passport photos" on storage.objects;
create policy "Students can delete own passport photos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'passport_photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Students can upload own school IDs" on storage.objects;
create policy "Students can upload own school IDs"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'school_ids'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Students can read own school IDs" on storage.objects;
create policy "Students can read own school IDs"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'school_ids'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Students can update own school IDs" on storage.objects;
create policy "Students can update own school IDs"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'school_ids'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'school_ids'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Students can delete own school IDs" on storage.objects;
create policy "Students can delete own school IDs"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'school_ids'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
