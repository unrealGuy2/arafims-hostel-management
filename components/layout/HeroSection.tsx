"use client";

import { useRouter } from "next/navigation";

export function HeroSection() {
  const router = useRouter();

  return (
    <section className="min-h-screen pt-24 px-4 sm:px-6 lg:px-8 flex items-center justify-center relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 50%, rgba(16, 165, 116, 0.1) 0%, transparent 50%)",
        }}
      />

      <div className="max-w-4xl mx-auto text-center relative z-10">
        <div className="inline-block mb-6">
          <span className="text-sm font-medium text-[#d4a574] bg-[#1a1a1a] px-4 py-2 rounded-full border border-[#2a2a2a]">
            The Arafims digital experience
          </span>
        </div>

        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 font-display">
          Welcome to
          <br />
          <span className="text-[#10a574]">Arafims</span>.
        </h1>

        <p className="text-lg sm:text-xl text-[#b8b8b8] mb-8 max-w-2xl mx-auto leading-relaxed">
          Arafims replaces paper forms and manual processes with one clean
          platform — reservations, complaints, caution fees, and more.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => router.push("/signup")}
            className="px-8 py-3 bg-[#10a574] hover:bg-[#1ec98c] text-[#0f0f0f] font-semibold rounded-lg transition-colors text-center"
          >
            Get started →
          </button>
          <button
            onClick={() => router.push("/signin")}
            className="px-8 py-3 border border-[#2a2a2a] hover:border-[#10a574] text-[#f5f5f5] font-semibold rounded-lg transition-colors text-center"
          >
            Sign in
          </button>
        </div>
      </div>
    </section>
  );
}
