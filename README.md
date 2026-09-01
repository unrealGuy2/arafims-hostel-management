# Arafims Hostel Management System

A production-ready hostel management and reservation platform built with Next.js, React, TypeScript, and Supabase.

## Overview

Arafims is a digital platform for managing hostel accommodation reservations, payments, and operations for multiple hostel properties. The system serves three hostel properties:

- **Arafims 1** (185 rooms, 741 bedspaces)
- **Arafims 2** (136 rooms, 684 bedspaces)
- **Zamfara PG** (70 rooms, 142 bedspaces)

### Key Features

- **Student Applications**: Browse rooms, submit applications
- **Manager Review**: Approve/reject applications with email notifications
- **Payment Workflow**: Bank transfer verification with receipt uploads
- **Secure Access Control**: Role-based access with Supabase RLS
- **Hostel Isolation**: Complete data separation between properties
- **Platform Analytics**: Private metrics for system administrators

---

## Tech Stack

- **Frontend**: Next.js 16.3.4 with App Router
- **UI Framework**: React 19
- **Type Safety**: TypeScript 5 (strict mode)
- **Styling**: Tailwind CSS v4
- **Backend**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage
- **Build Tool**: Turbopack (fast compilation)

---

## Project Structure

```
arafimsnew/
├── app/                        # Next.js App Router pages
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Landing page
│   ├── (auth)/                 # Auth routes (signup, signin)
│   ├── student/                # Student dashboard
│   ├── manager/                # Manager dashboard
│   ├── admin/                  # Master admin dashboard
│   ├── platform/               # Platform admin (private analytics)
│   └── api/                    # API routes
│
├── lib/                        # Shared utilities
│   ├── supabase/               # Supabase client setup
│   ├── types/                  # TypeScript types
│   ├── utils/                  # Helper functions
│   └── constants/              # App constants
│
├── components/                 # React components
│   ├── layout/                 # Layout components
│   ├── forms/                  # Form components
│   ├── cards/                  # Card components
│   └── shared/                 # Shared components
│
├── styles/                     # Global styles
├── public/                     # Static assets
└── node_modules/               # Dependencies
```

---

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Supabase project account (for database setup - Phase 1)

### Installation

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
# Edit .env.local with your Supabase credentials
```

### Development

```bash
# Start development server
npm run dev

# Open browser to http://localhost:3000
```

### Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

### Linting

```bash
npm run lint
```

---

## Environment Variables

Create a `.env.local` file with the following variables:

```
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-key

# Server-only (never expose to browser)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

See `.env.example` for a template.

---

## Architecture Principles

### Security First
- Row-Level Security (RLS) on all database tables
- Server-side authorization enforcement
- No client-trusted roles
- Secure file storage with restricted access
- Never expose service role key to browser

### Hostel Isolation
- Complete data separation between hostel properties
- Managers can only access their assigned hostel
- Receptionists can only access their assigned hostel
- Master admin can access all hostels
- Cross-hostel access prevention at database level

### Separation of Concerns
- Clear distinction between student, staff, and admin functionality
- PLATFORM_ADMIN separate from MASTER_ADMIN
- Clean client/server boundaries
- Centralized business logic

### Clean Code
- TypeScript strict mode required
- No magic strings or hardcoded hostel checks
- Configurable data relationships
- Reusable components and utilities
- Maintainable architecture

---

## User Roles

### STUDENT
- Create account and sign in
- Browse available rooms
- Submit reservation applications
- View reservation status
- Upload payment receipts
- Access payment history

### RECEPTIONIST
- View hostel-specific students
- View hostel information
- Future: report misconduct

### MANAGER
- Review pending reservations
- Approve/reject applications
- Send notification emails
- Review and verify payment receipts
- View room availability

### MASTER_ADMIN
- Manage all hostels
- Manage staff and assignments
- Future: reports and exports

### PLATFORM_ADMIN (Private)
- View system-wide analytics
- Monitor application health
- Access private metrics
- **Completely separate from normal users**

---

## Database Schema (Future)

Key tables will include:
- `auth.users` (Supabase Auth)
- `profiles` (Student, staff, admin profiles)
- `roles` (Role assignments)
- `hostels` (Property information)
- `rooms` (Room details)
- `bedspaces` (Individual bed allocations)
- `reservations` (Application workflow)
- `payments` (Payment tracking)
- `receipts` (Upload management)

All with proper RLS policies and foreign keys.

---

## Workflow

### Reservation Flow
1. Student signs up → complete profile → browse hostels/rooms → submit application
2. Manager reviews → approves/rejects → student receives email
3. If approved: student proceeds to payment page
4. Student transfers money → uploads receipt
5. Manager/admin verifies receipt → payment confirmed
6. Reservation becomes confirmed

### Payment Flow
- Bank transfer to hostel-configured account
- Receipt-based verification (not automated)
- Clear separation between application approval and payment

---

## Coding Standards

### TypeScript
- Strict mode enabled
- Proper typing for all functions
- No `any` unless genuinely necessary
- Clear type definitions in `lib/types/`

### Components
- Small, reusable components
- Clear prop typing
- Proper error boundaries
- Loading and empty states

### Styling
- Tailwind CSS utilities
- Brand color variables
- Dark mode support planned
- Mobile-first responsive design

### Security
- Input validation on forms
- Server-side authorization checks
- RLS policies on all queries
- No sensitive data in logs

---

## Important Notes

### NOT Implemented Yet
- Full database schema
- Authentication system
- Dashboard functionality
- Reservation workflows
- Payment processing
- Email notifications
- Platform analytics

### Future Features (Planned)
- Complaint system
- Caution fee management
- Misconduct reporting
- Card access logs
- Excel exports
- University expansion

### Intentional Limitations
- NOT a multi-owner SaaS platform
- NOT a university-wide system
- NOT for independent hostel operators
- Only for Arafims properties currently

---

## Development Workflow

Phases are implemented sequentially as specified in the master specification. Each phase is complete before the next begins.

---

## Troubleshooting

### Development Server Won't Start
```bash
rm -rf .next node_modules
npm install
npm run dev
```

### TypeScript Errors
```bash
npm run lint
# Check tsconfig.json for correct paths
```

### Dependencies Issue
```bash
npm ci  # Clean install with lock file
```

---

## Support & Documentation

- **Master Specification**: See `SETUP_REPORT.md`
- **Environment Setup**: See `.env.example`
- **Phase Implementations**: Watch for phase-specific prompts

---

## License

Private project for Arafims. All rights reserved.

---

**Status**: Foundation established, ready for Phase 1 implementation
