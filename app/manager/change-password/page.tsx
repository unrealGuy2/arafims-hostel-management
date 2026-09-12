import { redirect } from "next/navigation";
import { PasswordChangeForm } from "@/components/forms/PasswordChangeForm";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export default async function ManagerChangePasswordPage() {
  const context = await getAuthorizationContext();

  if (!context || (context.role !== "manager" && context.role !== "master_admin")) {
    redirect("/signin");
  }

  if (!context.mustChangePassword) {
    redirect(context.role === "master_admin" ? "/owner" : "/manager");
  }

  return (
    <main className="min-h-screen bg-[#0f0f0f] px-4 py-12 text-[#f5f5f5] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm uppercase tracking-[0.2em] text-[#d4a574]">
          Hi, {context.displayName}
        </p>
        <h1 className="mt-2 text-3xl font-bold font-display">
          Update your temporary password
        </h1>
        <p className="mt-3 text-[#b8b8b8]">
          Change your temporary password before accessing the manager dashboard.
        </p>
        <PasswordChangeForm redirectTo="/manager" />
      </div>
    </main>
  );
}
