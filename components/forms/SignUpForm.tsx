"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormInput } from "./FormInput";
import { FormSelect } from "./FormSelect";
import { FormFileInput } from "./FormFileInput";
import { validateSignUp, validateAdmissionLetterRequired } from "@/lib/utils/validation";

const LEVELS = [
  { value: "100", label: "100" },
  { value: "200", label: "200" },
  { value: "300", label: "300" },
  { value: "400", label: "400" },
  { value: "500", label: "500" },
  { value: "600", label: "600" },
];

const GENDERS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
];

interface SignUpFormErrors {
  full_name?: string;
  email?: string;
  password?: string;
  gender?: string;
  level?: string;
  department?: string;
  faculty?: string;
  age?: string;
  previous_hostel?: string;
  matric_number?: string;
  guardian_name?: string;
  guardian_phone?: string;
  admission_letter?: string;
  general?: string;
}

export function SignUpForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<SignUpFormErrors>({});
  const [level, setLevel] = useState("");
  const [admissionFile, setAdmissionFile] = useState<File | null>(null);
  const [successMessage, setSuccessMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setSuccessMessage("");
    setLoading(true);

    try {
      const formData = new FormData(e.currentTarget);
      const data = {
        full_name: formData.get("full_name"),
        email: formData.get("email"),
        password: formData.get("password"),
        gender: formData.get("gender"),
        level: level,
        department: formData.get("department"),
        faculty: formData.get("faculty"),
        age: formData.get("age") === null ? undefined : Number(formData.get("age")),
        previous_hostel: formData.get("previous_hostel"),
        matric_number: formData.get("matric_number"),
        guardian_name: formData.get("guardian_name"),
        guardian_phone: formData.get("guardian_phone"),
        admission_letter: admissionFile,
      };

      const validation = validateSignUp(data);
      if (!validation.success) {
        const fieldErrors: SignUpFormErrors = {};
        validation.error.issues.forEach((issue: any) => {
          const path = (issue.path[0] as string) || "general";
          fieldErrors[path as keyof SignUpFormErrors] = issue.message;
        });
        setErrors(fieldErrors);
        setLoading(false);
        return;
      }

      const submitFormData = new FormData();
      submitFormData.append("full_name", validation.data.full_name);
      submitFormData.append("email", validation.data.email);
      submitFormData.append("password", validation.data.password);
      submitFormData.append("gender", validation.data.gender);
      submitFormData.append("level", validation.data.level.toString());
      submitFormData.append("department", validation.data.department);
      submitFormData.append("faculty", validation.data.faculty);
      submitFormData.append("age", validation.data.age.toString());
      submitFormData.append("previous_hostel", validation.data.previous_hostel);
      submitFormData.append("matric_number", validation.data.matric_number);
      submitFormData.append("guardian_name", validation.data.guardian_name);
      submitFormData.append("guardian_phone", validation.data.guardian_phone);
      if (validation.data.admission_letter) {
        submitFormData.append(
          "admission_letter",
          validation.data.admission_letter
        );
      }

      const response = await fetch("/api/auth/signup", {
        method: "POST",
        body: submitFormData,
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.errors) {
          setErrors(result.errors);
        } else {
          setErrors({ general: result.message || "Signup failed" });
        }
        setLoading(false);
        return;
      }

      setSuccessMessage(
        "Signup successful! Redirecting to signin..."
      );
      setTimeout(() => router.push("/signin"), 2000);
    } catch (error) {
      setErrors({
        general: error instanceof Error ? error.message : "Signup failed",
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

      {successMessage && (
        <div className="p-4 bg-[#10a574]/10 border border-[#10a574]/30 rounded-lg text-[#10a574]">
          {successMessage}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <FormInput
          label="Full Name"
          name="full_name"
          type="text"
          placeholder="John Doe"
          error={errors.full_name}
          required
        />
        <FormInput
          label="Email"
          name="email"
          type="email"
          placeholder="john@example.com"
          error={errors.email}
          required
        />
      </div>

      <FormInput
        label="Password"
        name="password"
        type="password"
        placeholder="••••••••"
        error={errors.password}
        helperText="At least 8 characters with uppercase, lowercase, and number"
        required
      />

      <div className="grid md:grid-cols-2 gap-6">
        <FormSelect
          label="Gender"
          name="gender"
          options={GENDERS}
          error={errors.gender}
          placeholder="Select gender"
          required
        />
        <FormSelect
          label="Level"
          name="level"
          options={LEVELS}
          error={errors.level}
          placeholder="Select your level"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          required
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <FormInput
          label="Department"
          name="department"
          type="text"
          placeholder="e.g., Computer Science"
          error={errors.department}
          required
        />
        <FormInput
          label="Faculty"
          name="faculty"
          type="text"
          placeholder="e.g., Science"
          error={errors.faculty}
          required
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <FormInput
          label="Age"
          name="age"
          type="number"
          placeholder="18"
          min="15"
          max="80"
          error={errors.age}
          required
        />
        <FormInput
          label="Matric Number"
          name="matric_number"
          type="text"
          placeholder="e.g., UIL/SCI/22/001"
          error={errors.matric_number}
          required
        />
      </div>

      <FormInput
        label="Previous Hostel"
        name="previous_hostel"
        type="text"
        placeholder="e.g., Arafims 1"
        error={errors.previous_hostel}
        required
      />

      <div className="grid md:grid-cols-2 gap-6">
        <FormInput
          label="Guardian Name"
          name="guardian_name"
          type="text"
          placeholder="Guardian's full name"
          error={errors.guardian_name}
          required
        />
        <FormInput
          label="Guardian Phone"
          name="guardian_phone"
          type="tel"
          placeholder="+234 123 456 7890"
          error={errors.guardian_phone}
          required
        />
      </div>

      {validateAdmissionLetterRequired(level) && (
        <FormFileInput
          label="Admission Letter"
          name="admission_letter"
          accept=".pdf,.jpg,.jpeg,.png"
          error={errors.admission_letter}
          helperText="Upload your admission letter (PDF, JPG, or PNG)"
          maxSize={5242880}
          onChange={(e) => {
            if (e.target.files?.[0]) {
              setAdmissionFile(e.target.files[0]);
            }
          }}
          required
        />
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-[#10a574] hover:bg-[#1ec98c] disabled:bg-[#0d8a5f] text-[#0f0f0f] font-semibold rounded-lg transition-colors"
      >
        {loading ? "Creating account..." : "Create Account"}
      </button>
    </form>
  );
}
