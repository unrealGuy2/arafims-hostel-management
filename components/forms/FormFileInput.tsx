import { InputHTMLAttributes } from "react";

interface FormFileInputProps
  extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
  maxSize?: number;
}

export function FormFileInput({
  label,
  error,
  helperText,
  maxSize,
  className = "",
  ...props
}: FormFileInputProps) {
  const maxSizeText = maxSize
    ? ` (Max ${Math.floor(maxSize / 1024 / 1024)}MB)`
    : "";

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-[#f5f5f5]">
        {label}
      </label>
      <div className="relative">
        <input
          type="file"
          className={`w-full px-4 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-[#f5f5f5] file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-[#10a574] file:text-[#0f0f0f] file:font-semibold hover:file:bg-[#1ec98c] focus:outline-none focus:border-[#10a574] focus:ring-1 focus:ring-[#10a574] transition-colors ${className} ${
            error
              ? "border-red-500 focus:border-red-500 focus:ring-red-500"
              : ""
          }`}
          {...props}
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {helperText && !error && (
        <p className="text-sm text-[#888]">{helperText + maxSizeText}</p>
      )}
    </div>
  );
}
