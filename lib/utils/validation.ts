import { z } from "zod";

const SignInSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const SignUpSchema = z
  .object({
    full_name: z.string().min(2, "Full name is required"),
    email: z.string().email("Invalid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain uppercase letter")
      .regex(/[a-z]/, "Password must contain lowercase letter")
      .regex(/[0-9]/, "Password must contain number"),
    gender: z
      .enum(["MALE", "FEMALE"])
      .default("MALE"),
    level: z
      .enum(["100", "200", "300", "400", "500", "600"]),
    department: z.string().min(1, "Department is required"),
    faculty: z.string().min(1, "Faculty is required"),
    age: z.number().int().min(15).max(80),
    previous_hostel: z.string().min(1, "Previous hostel information required"),
    matric_number: z.string().min(1, "Matric number is required"),
    guardian_name: z.string().min(1, "Guardian name is required"),
    guardian_phone: z.string().min(10, "Valid phone number required"),
    admission_letter: z.instanceof(File).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.level === "100" && !data.admission_letter) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["admission_letter"],
        message: "Admission letter is required for level 100 students",
      });
    }
    if (data.admission_letter) {
      if (data.admission_letter.size > 5242880) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["admission_letter"],
          message: "File must be less than 5MB",
        });
      }
      const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
      if (!allowedTypes.includes(data.admission_letter.type)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["admission_letter"],
          message: "File must be PDF, JPG, or PNG",
        });
      }
    }
  });

type SignUpSchemaType = typeof SignUpSchema;
type SignUpData = z.infer<SignUpSchemaType>;

interface SignUpWithFileData extends Omit<SignUpData, "level" | "age"> {
  level: 100 | 200 | 300 | 400 | 500 | 600;
  age: number;
  admission_letter?: File;
}

export function validateSignIn(data: unknown) {
  return SignInSchema.safeParse(data);
}

export function validateSignUp(data: unknown) {
  const parsed = SignUpSchema.safeParse(data);

  if (!parsed.success) {
    return parsed;
  }

  const level = parseInt(parsed.data.level);
  const age = Number(parsed.data.age);

  return {
    success: true as const,
    data: {
      ...parsed.data,
      level: level as 100 | 200 | 300 | 400 | 500 | 600,
      age,
    },
  };
}

export function validateAdmissionLetterRequired(level: number | string): boolean {
  return level === 100 || level === "100";
}
