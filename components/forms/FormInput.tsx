import { InputHTMLAttributes } from "react";

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
}

export function FormInput({
  label,
  error,
  helperText,
  className = "",
  ...props
}: FormInputProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-[#f5f5f5]">
        {label}
      </label>
      <input
        className={`w-full px-4 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-[#f5f5f5] placeholder-[#666] focus:outline-none focus:border-[#10a574] focus:ring-1 focus:ring-[#10a574] transition-colors ${className} ${
          error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""
        }`}
        {...props}
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
      {helperText && !error && (
        <p className="text-sm text-[#888]">{helperText}</p>
      )}
    </div>
  );
}
