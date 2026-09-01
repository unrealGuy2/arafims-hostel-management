import Link from "next/link";
import { SignInForm } from "@/components/forms/SignInForm";

export const metadata = {
  title: "Sign In | Arafims",
  description: "Sign in to your Arafims account",
};

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-[#0f0f0f] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="mb-8">
          <Link href="/" className="text-2xl font-bold text-[#10a574]">
            Arafims
          </Link>
        </div>

        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-8 sm:p-12">
          <div className="mb-8">
            <h1 className="text-3xl font-bold font-display mb-2">
              Welcome back
            </h1>
            <p className="text-[#b8b8b8]">
              Sign in to your Arafims account.
            </p>
          </div>

          <SignInForm />

          <div className="mt-6 text-center text-[#b8b8b8]">
            Don't have an account?{" "}
            <Link href="/signup" className="text-[#10a574] hover:text-[#1ec98c]">
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
