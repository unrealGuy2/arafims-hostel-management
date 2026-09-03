"use client";

import { useState } from "react";
import { passwordSchema } from "@/lib/utils/validation";

export function PasswordChangeForm() {
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors([]);
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const currentPassword = String(formData.get("currentPassword") ?? "");
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");
    const validation = passwordSchema.safeParse(newPassword);
    const nextErrors: string[] = [];

    if (!currentPassword) {
      nextErrors.push("Current password is required");
    }
    if (!validation.success) {
      nextErrors.push(validation.error.issues[0]?.message ?? "New password is invalid");
    }
    if (newPassword !== confirmPassword) {
      nextErrors.push("New passwords do not match");
    }
    if (nextErrors.length > 0) {
      setErrors(nextErrors);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = await response.json();

      if (!response.ok) {
        setErrors([result.message || "Unable to change password"]);
        return;
      }

      event.currentTarget.reset();
      setMessage("Password changed successfully.");
    } catch {
      setErrors(["Unable to change password"]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6">
      <h2 className="text-2xl font-bold font-display">Change Password</h2>
      <form onSubmit={handleSubmit} className="mt-5 max-w-xl space-y-4">
        <input
          required
          name="currentPassword"
          type="password"
          placeholder="Current password"
          autoComplete="current-password"
          className="w-full rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-2 text-sm text-[#f5f5f5]"
        />
        <input
          required
          name="newPassword"
          type="password"
          placeholder="New password"
          autoComplete="new-password"
          className="w-full rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-2 text-sm text-[#f5f5f5]"
        />
        <input
          required
          name="confirmPassword"
          type="password"
          placeholder="Confirm new password"
          autoComplete="new-password"
          className="w-full rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-2 text-sm text-[#f5f5f5]"
        />
        <p className="text-sm text-[#888]">
          Use at least 8 characters with uppercase, lowercase, and a number.
        </p>
        {errors.length > 0 && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {errors.map((error) => <p key={error}>{error}</p>)}
          </div>
        )}
        {message && (
          <p className="rounded-lg border border-[#10a574]/30 bg-[#10a574]/10 p-3 text-sm text-[#7ef1c6]">
            {message}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-[#10a574] px-4 py-2 text-sm font-semibold text-[#0f0f0f] disabled:opacity-60"
        >
          {loading ? "Changing password..." : "Change password"}
        </button>
      </form>
    </section>
  );
}
