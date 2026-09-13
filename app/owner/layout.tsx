import Link from "next/link";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-[#f5f5f5]">
      <header className="border-b border-[#2a2a2a] bg-[#0f0f0f]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 md:flex-row md:items-center md:justify-between">
          <Link href="/owner" className="text-2xl font-bold text-[#10a574]">
            Arafims Owner
          </Link>
          <nav className="flex flex-wrap gap-1">
            {[
              ["Overview", "/owner"],
              ["Applications", "/owner/applications"],
              ["Students", "/owner/applications"],
              ["Payments", "/owner/payments"],
              ["Reports / Export", "/owner#reports"],
              ["Account", "/owner#account"],
            ].map(([label, href]) => (
              <Link
                key={label}
                href={href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-[#b8b8b8] transition-colors hover:bg-[#1a1a1a] hover:text-[#f5f5f5]"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
