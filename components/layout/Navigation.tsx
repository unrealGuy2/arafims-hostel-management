"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export function Navigation() {
  const router = useRouter();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0f0f0f]/90 backdrop-blur-sm border-b border-[#2a2a2a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold text-[#10a574]">
          Arafims
        </Link>

        <div className="hidden md:flex items-center gap-8">
          <a
            href="#overview"
            className="text-[#f5f5f5] hover:text-[#10a574] transition-colors text-sm font-medium"
          >
            Overview
          </a>
          <a
            href="#how-it-works"
            className="text-[#f5f5f5] hover:text-[#10a574] transition-colors text-sm font-medium"
          >
            How it works
          </a>
          <a
            href="#about"
            className="text-[#f5f5f5] hover:text-[#10a574] transition-colors text-sm font-medium"
          >
            About Arafims
          </a>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/signin")}
            className="px-4 py-2 text-sm font-medium text-[#f5f5f5] hover:text-[#10a574] transition-colors"
          >
            Sign in
          </button>
          <button
            onClick={() => router.push("/signup")}
            className="px-4 py-2 bg-[#10a574] hover:bg-[#1ec98c] text-[#0f0f0f] text-sm font-semibold rounded-lg transition-colors"
          >
            Get Started
          </button>
        </div>
      </div>
    </nav>
  );
}

const studentLinks = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/reservations", label: "Accommodation" },
  { href: "/dashboard/profile", label: "My Profile" },
  { href: "/dashboard/payments", label: "Payments" },
  { href: "/dashboard/documents", label: "Documents" },
];

export function StudentNavigation({
  signOutAction,
}: {
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname() ?? "";

  return (
    <nav className="border-b border-[#2a2a2a] bg-[#0f0f0f]">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 md:flex-row md:items-center md:justify-between">
        <Link href="/dashboard" className="text-2xl font-bold text-[#10a574]">
          Arafims
        </Link>
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
          {studentLinks.map((link) => {
            const active =
              link.href === "/dashboard"
                ? pathname === link.href
                : pathname.startsWith(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-[#10a574] text-[#0f0f0f]"
                    : "text-[#b8b8b8] hover:bg-[#1a1a1a] hover:text-[#f5f5f5]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
        <form action={signOutAction} className="shrink-0 self-start md:self-auto">
          <button
            type="submit"
            className="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/10"
          >
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
