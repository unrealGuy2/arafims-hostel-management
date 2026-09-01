"use client";

import { useRouter } from "next/navigation";

const HOSTELS = [
  {
    name: "Arafims 1",
    id: "arafims-1",
  },
  {
    name: "Arafims 2",
    id: "arafims-2",
  },
  {
    name: "Zamfara Hostel",
    id: "zamfara-pg",
  },
];

export function HostelsSection() {
  const router = useRouter();

  return (
    <section id="overview" className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-[#d4a574] mb-3">
            Arafims Hostels
          </p>
          <h2 className="text-4xl sm:text-5xl font-bold font-display mb-4">
            Select your hostel
          </h2>
          <p className="text-lg text-[#b8b8b8]">
            Choose your hostel to continue.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {HOSTELS.map((hostel) => (
            <div
              key={hostel.id}
              className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-8 hover:border-[#10a574] transition-all group cursor-pointer"
            >
              <h3 className="text-2xl font-bold mb-6 group-hover:text-[#10a574] transition-colors">
                {hostel.name}
              </h3>

              <button
                onClick={() => router.push("/signup")}
                className="text-[#10a574] hover:text-[#1ec98c] font-semibold flex items-center gap-2 transition-colors"
              >
                Continue →
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
