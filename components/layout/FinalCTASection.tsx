"use client";

import { useRouter } from "next/navigation";

export function FinalCTASection() {
  const router = useRouter();

  return (
    <section id="about" className="py-20 px-4 sm:px-6 lg:px-8 bg-[#1a1a1a]">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-4xl sm:text-5xl font-bold font-display mb-4">
          One place for the things that matter.
        </h2>

        <p className="text-2xl font-semibold mb-6 font-display text-[#d4a574]">
          Welcome to Arafims.
        </p>

        <p className="text-lg text-[#b8b8b8] mb-8">
          Your Arafims experience starts here.
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
