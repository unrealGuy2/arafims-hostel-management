import { SelectHTMLAttributes } from "react";

interface FormSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: Array<{ value: string; label: string }>;
  error?: string;
  placeholder?: string;
}

export function FormSelect({
  label,
  options,
  error,
  placeholder,
  className = "",
  ...props
}: FormSelectProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-[#f5f5f5]">
        {label}
      </label>
      <select
        className={`w-full px-4 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-[#f5f5f5] focus:outline-none focus:border-[#10a574] focus:ring-1 focus:ring-[#10a574] transition-colors ${className} ${
          error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""
        }`}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
