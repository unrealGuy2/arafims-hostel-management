# Arafims Development Guide

This document provides guidelines for implementing phases of the Arafims system.

---

## Before You Start Any Phase

### Checklist
- [ ] Read the phase-specific prompt
- [ ] Understand the scope (what to implement)
- [ ] Identify existing code to reuse
- [ ] Plan the implementation
- [ ] Check TypeScript compiles: `npm run lint`
- [ ] Start the dev server: `npm run dev`

### Never Do
- ❌ Skip phases
- ❌ Implement future features not in the current phase
- ❌ Rewrite working code
- ❌ Add unnecessary dependencies
- ❌ Hardcode hostel/room data
- ❌ Trust client-side data for authorization
- ❌ Expose service role keys

---

## Implementing a Phase

### 1. Inspect Existing Code
```bash
# Review relevant files before making changes
ls -la app/
ls -la lib/
grep -r "TODO\|FIXME" . --include="*.ts" --include="*.tsx"
```

### 2. Understand the Business Logic
Read the master specification and phase prompt carefully to understand:
- User workflows
- Data relationships
- Security requirements
- Error cases

### 3. Write TypeScript First
- Define types in `lib/types/`
- Ensure strict typing
- Compile without errors: `npx tsc --noEmit`

### 4. Implement Components
- Create components in `components/`
- Keep components small and focused
- Use proper React patterns
- Add loading and error states

### 5. Add API Routes (if needed)
- Create routes in `app/api/`
- Use server-side authentication
- Validate inputs
- Handle errors gracefully

### 6. Database Work (if needed)
- Design schema carefully
- Add RLS policies
- Test with RLS enabled
- Never use service role for client work

### 7. Test
```bash
# Compile check
npm run lint

# Manual testing
npm run dev
# Test in browser

# Type check
npx tsc --noEmit
```

### 8. Document Changes
```bash
# Describe what changed
git add .
git commit -m "Phase X: [description]

- Feature 1
- Feature 2
- Bug fix

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Key Files to Know

### Configuration
- `next.config.ts` - Next.js configuration
- `tsconfig.json` - TypeScript settings
- `tailwind.config.ts` - Not yet created, will be added
- `postcss.config.mjs` - PostCSS config
- `.env.example` - Environment template

### Authentication & Database
- `lib/supabase/client.ts` - (To be created) Client-side client
- `lib/supabase/server.ts` - (To be created) Server-side client
- `lib/types/auth.ts` - (To be created) Auth types

### Pages & Layouts
- `app/layout.tsx` - Root layout (metadata, fonts, styles)
- `app/page.tsx` - Home page (will be landing page in Phase 1)

### Styles
- `app/globals.css` - Global styles (will have Arafims brand colors)

---

## Common Patterns

### Creating a Server Component
```typescript
// app/student/dashboard/page.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function StudentDashboard() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) redirect("/signin");
  
  // Fetch user data securely server-side
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  
  return (
    <div>
      <h1>Dashboard</h1>
      {/* Content */}
    </div>
  );
}
```

### Creating a Client Component
```typescript
// components/forms/ProfileForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ProfileForm({ user }: { user: any }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Perform update
      const { error } = await supabase
        .from("profiles")
        .update({
          // data
        })
        .eq("id", user.id);
      
      if (error) throw error;
      router.refresh();
    } catch (error) {
      console.error(error);
      // Show error to user
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
    </form>
  );
}
```

### Creating a Type
```typescript
// lib/types/student.ts
export interface StudentProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  gender: "MALE" | "FEMALE";
  level: 100 | 200 | 300 | 400 | 500 | 600;
  department: string;
  faculty: string;
  matric_number: string;
  guardian_name: string;
  guardian_phone: string;
  created_at: string;
  updated_at: string;
}
```

---

## Security Checklist

### For Every Feature
- [ ] Input validation (frontend + backend)
- [ ] Authentication check (user logged in?)
- [ ] Authorization check (user allowed to do this?)
- [ ] RLS policy applied (database level)
- [ ] No service role key in browser
- [ ] No raw error messages to user
- [ ] Sensitive data not in logs
- [ ] File uploads scanned/restricted
- [ ] Rate limiting considered

### For Database Operations
- [ ] RLS enabled on all tables
- [ ] Foreign keys set up correctly
- [ ] Indexes on filter columns
- [ ] Constraints prevent invalid data
- [ ] Audit timestamps (created_at, updated_at)

### For Hostel Operations
- [ ] Manager can only see their hostel
- [ ] Receptionist can only see their hostel
- [ ] Students can only see their own reservations
- [ ] Hostel filter applied to all queries
- [ ] URL parameters not trusted for hostel access

---

## Troubleshooting

### "Cannot find module"
```bash
# Check import path
# Verify file exists
# Check paths in tsconfig.json
ls -la lib/supabase/  # Example
```

### "Permission denied" errors
- Check RLS policies
- Verify user is authenticated
- Check user role in database
- Try with service role to test

### "Type errors"
```bash
# Check types
npx tsc --noEmit

# Verify types match database
# Check return types of functions
```

### Development server crashes
```bash
# Kill the process
# Clear .next and node_modules if needed
rm -rf .next
npm run dev
```

---

## Performance Tips

### Database Queries
- Select only needed columns: `.select("id, email")`
- Use filters: `.eq("hostel_id", hostelId)`
- Avoid N+1 queries
- Use joins for related data
- Implement pagination for large tables

### Components
- Use `React.memo` for expensive components
- Lazy load with `dynamic()`
- Server components by default
- Client components only when needed

### Images
- Optimize with `next/image`
- Use appropriate sizes
- Lazy load below the fold

---

## Code Style

### Naming
```typescript
// Components: PascalCase
function StudentDashboard() {}

// Functions: camelCase
function getUserProfile() {}

// Constants: UPPER_SNAKE_CASE
const MAX_FILE_SIZE = 5242880; // 5MB

// Types: PascalCase
type StudentProfile = { ... };
interface Reservation { ... }
```

### Comments
```typescript
// Use comments for WHY, not WHAT

// ✅ Good
// Check if student level 100 requires admission letter
if (student.level === 100) {

// ❌ Bad
// Set requiresAdmissionLetter to true
requiresAdmissionLetter = true;
```

### Error Handling
```typescript
// Always handle errors
try {
  await updateProfile(data);
} catch (error) {
  // Log for debugging
  console.error("Profile update failed:", error);
  // Show user-friendly message
  showError("Unable to update profile. Please try again.");
}
```

---

## Git Workflow

### Commits
```bash
git add .
git commit -m "Phase X: Brief description

Detailed explanation of changes:
- What was implemented
- Why this approach
- Any gotchas

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Before Pushing
```bash
# Verify no errors
npm run lint
npx tsc --noEmit

# Test manually
npm run dev
```

---

## Resources

- **Next.js Docs**: https://nextjs.org/docs
- **React Docs**: https://react.dev
- **TypeScript Docs**: https://www.typescriptlang.org/docs/
- **Tailwind CSS**: https://tailwindcss.com/docs
- **Supabase Docs**: https://supabase.com/docs
- **Arafims Master Spec**: See SETUP_REPORT.md

---

## When Stuck

1. **Read the spec** - What exactly is required?
2. **Check existing code** - Is there similar functionality?
3. **Search for errors** - What does the error message say?
4. **Type check** - Does TypeScript complain?
5. **Test in browser** - What's actually happening?
6. **Check the database** - Is data there?
7. **Ask for clarification** - If genuinely ambiguous

---

**Remember**: Build it right the first time. This is a real production system.
