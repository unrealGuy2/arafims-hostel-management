import Link from "next/link";
import { SignUpForm } from "@/components/forms/SignUpForm";

export const metadata = {
  title: "Sign Up | Arafims",
  description: "Create your Arafims account",
};

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-[#0f0f0f] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Link href="/" className="text-2xl font-bold text-[#10a574]">
            Arafims
          </Link>
        </div>

        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-8 sm:p-12">
          <div className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold font-display mb-2">
              Create your account
            </h1>
            <p className="text-[#b8b8b8]">
              Set up your Arafims account and get access to the platform.
            </p>
          </div>

          <SignUpForm />

          <div className="mt-6 text-center text-[#b8b8b8]">
            Already have an account?{" "}
            <Link href="/signin" className="text-[#10a574] hover:text-[#1ec98c]">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
