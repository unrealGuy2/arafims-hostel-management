"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormInput } from "./FormInput";
import { validateSignIn } from "@/lib/utils/validation";

interface SignInErrors {
  email?: string;
  password?: string;
  general?: string;
}

export function SignInForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<SignInErrors>({});

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setLoading(true);

    try {
      const formData = new FormData(e.currentTarget);
      const data = {
        email: formData.get("email"),
        password: formData.get("password"),
      };

      const validation = validateSignIn(data);
      if (!validation.success) {
        const fieldErrors: SignInErrors = {};
        validation.error.issues.forEach((issue: any) => {
          const path = (issue.path[0] as string) || "general";
          fieldErrors[path as keyof SignInErrors] = issue.message;
        });
        setErrors(fieldErrors);
        setLoading(false);
        return;
      }

      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.data),
      });

      const result = await response.json();

      if (!response.ok) {
        setErrors({
          general: result.message || "Invalid email or password",
        });
        setLoading(false);
        return;
      }

      router.push(
        result.role === "master_admin"
          ? "/owner"
          : result.role === "manager"
            ? "/manager"
            : "/dashboard"
      );
    } catch (error) {
      setErrors({
        general: error instanceof Error ? error.message : "Signin failed",
      });
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errors.general && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          {errors.general}
        </div>
      )}

      <FormInput
        label="Email"
        name="email"
        type="email"
        error={errors.email}
        required
      />

      <FormInput
        label="Password"
        name="password"
        type="password"
        error={errors.password}
        required
      />

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-[#10a574] hover:bg-[#1ec98c] disabled:bg-[#0d8a5f] text-[#0f0f0f] font-semibold rounded-lg transition-colors"
      >
        {loading ? "Signing in..." : "Sign In"}
      </button>
    </form>
  );
}
