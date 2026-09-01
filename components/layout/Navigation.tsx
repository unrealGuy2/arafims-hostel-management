"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

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
