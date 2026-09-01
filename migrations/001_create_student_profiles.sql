create table if not exists public.student_profiles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  gender text not null check (gender in ('MALE', 'FEMALE')),
  level integer not null check (level in (100, 200, 300, 400, 500, 600)),
  department text not null,
  faculty text not null,
  age integer not null check (age >= 15 and age <= 80),
  previous_hostel text not null,
  matric_number text not null,
  guardian_name text not null,
  guardian_phone text not null,
  admission_letter_path text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.student_profiles enable row level security;

create policy "Students can read own profile"
  on public.student_profiles
  for select
  using (auth.uid() = user_id);

create policy "Students can update own profile"
  on public.student_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Only admins can delete profiles"
  on public.student_profiles
  for delete
  using (false);

create index if not exists idx_student_profiles_user_id on public.student_profiles(user_id);
create index if not exists idx_student_profiles_email on public.student_profiles(email);
