# Supabase Setup for Arafims Phase 1

This guide walks you through the Supabase configuration needed for Phase 1 to work.

## Prerequisites

- Supabase project created
- Environment variables in `.env.local`:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

## Step 1: Create the Database Schema

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Click "New Query"
4. Copy the contents of `migrations/001_create_student_profiles.sql`
5. Paste it into the SQL editor
6. Click "Run"

This will create:
- `public.student_profiles` table
- RLS (Row Level Security) policies
- Indexes for performance

## Step 2: Create Storage Bucket for Admission Letters

1. Go to Storage in Supabase dashboard
2. Click "New bucket"
3. Name it: `admission_letters`
4. Set to **Private** (not public)
5. Click "Create bucket"

## Step 3: Configure Storage Policies

The storage bucket needs policies to:
- Allow authenticated users to upload their own files
- Prevent public access
- Prevent access to other users' files

1. Click on the `admission_letters` bucket
2. Go to "Policies" tab
3. Create a new policy using the policy editor:

### Upload Policy
- Policy name: "Users can upload own admission letters"
- Target roles: authenticated
- MIME type: Allowed operations should include "INSERT"
- Conditions: `bucket_id = 'admission_letters' AND (CAST(storage.foldername(name)[1] AS UUID)) = auth.uid()`

### Read Policy
- Policy name: "Users can read own admission letters"
- Target roles: authenticated
- Allowed operations: SELECT
- Conditions: `bucket_id = 'admission_letters' AND (CAST(storage.foldername(name)[1] AS UUID)) = auth.uid()`

### Delete Policy
- Policy name: "Users can delete own admission letters"
- Target roles: authenticated
- Allowed operations: DELETE
- Conditions: `bucket_id = 'admission_letters' AND (CAST(storage.foldername(name)[1] AS UUID)) = auth.uid()`

## Step 4: Verify Setup

### Test Database Connection
```bash
npm run dev
```

Then navigate to `/signup` and try signing up with a level 100 account to test:
- Database writes
- Admission letter uploads
- Authentication

### Test RLS Policies
1. Sign up with two different accounts
2. Try to access the dashboard of account A while logged in as account B
3. Verify that account B cannot see account A's data

The application should return 401 Unauthorized or no data if RLS is working correctly.

## Troubleshooting

### "Row-level security violated" errors
- Check that RLS policies were created correctly
- Verify `auth.uid()` is being used in policies
- Check that user is authenticated (logged in)

### "Admission letter bucket not found" errors
- Verify the bucket is named exactly `admission_letters`
- Check that bucket policies are configured
- Ensure the bucket is private

### File uploads not working
- Check storage bucket policies
- Verify file size is under 5MB
- Ensure file type is PDF, JPG, or PNG
- Check browser console for errors

### Signin not working
- Verify auth credentials in environment
- Check that Supabase Auth is enabled in project
- Verify email/password combination in test accounts

## Environment Variables

Verify your `.env.local` has:

```
NEXT_PUBLIC_SUPABASE_URL=https://tzubqkkdadbdukarqdni.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_8Fkvg5GUwb34ketulz4VRQ_ICsQy-4b
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**DO NOT** commit `.env.local` to git. It's in `.gitignore` for security.

## What's Working

After setup, these features should be functional:

1. ✅ Landing page with Arafims branding
2. ✅ Student signup with form validation
3. ✅ Level 100 admission letter requirement
4. ✅ File upload to Supabase Storage
5. ✅ Student profile creation in database
6. ✅ Student signin
7. ✅ Protected dashboard (RLS enforced)
8. ✅ Student profile view
9. ✅ Signout

## What's Not Implemented (Future Phases)

- Room reservations
- Manager approval workflow
- Payment system
- Email notifications
- Platform analytics
- Complaint system
- Caution fees
