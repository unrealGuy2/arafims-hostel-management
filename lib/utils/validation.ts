import { z } from "zod";

const MAX_STUDENT_DOCUMENT_SIZE = 5242880;
const FILE_SIGNATURES = {
  pdf: [0x25, 0x50, 0x44, 0x46],
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
} as const;

export type StudentDocumentKind = "passport_photo" | "school_id";

const studentDocumentExtensions: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

const studentDocumentRules: Record<
  StudentDocumentKind,
  { types: string[]; extensions: string[]; label: string }
> = {
  passport_photo: {
    types: ["image/jpeg", "image/png"],
    extensions: [".jpg", ".jpeg", ".png"],
    label: "Passport photograph",
  },
  school_id: {
    types: ["application/pdf", "image/jpeg", "image/png"],
    extensions: [".pdf", ".jpg", ".jpeg", ".png"],
    label: "School ID",
  },
};

const paymentReceiptRules = {
  types: ["application/pdf", "image/jpeg", "image/png"],
  extensions: [".pdf", ".jpg", ".jpeg", ".png"],
};

function hasSignature(bytes: Uint8Array, signature: readonly number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}

function matchesStudentDocumentSignature(
  bytes: Uint8Array,
  type: string
) {
  if (type === "application/pdf") {
    return hasSignature(bytes, FILE_SIGNATURES.pdf);
  }
  if (type === "image/jpeg") {
    return hasSignature(bytes, FILE_SIGNATURES.jpeg);
  }
  if (type === "image/png") {
    return hasSignature(bytes, FILE_SIGNATURES.png);
  }
  return false;
}

export async function validateStudentDocument(
  file: File,
  kind: StudentDocumentKind
) {
  const rules = studentDocumentRules[kind];
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

  if (file.size === 0 || file.size > MAX_STUDENT_DOCUMENT_SIZE) {
    return {
      valid: false,
      message: `${rules.label} must be less than 5MB`,
    };
  }

  if (!rules.types.includes(file.type) || !rules.extensions.includes(extension)) {
    return {
      valid: false,
      message: `${rules.label} must be ${kind === "passport_photo" ? "JPG or PNG" : "PDF, JPG, or PNG"}`,
    };
  }

  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (!matchesStudentDocumentSignature(bytes, file.type)) {
    return {
      valid: false,
      message: `${rules.label} file content is invalid`,
    };
  }

  return { valid: true as const };
}

export function createStudentDocumentPath(
  userId: string,
  kind: StudentDocumentKind,
  file: File
) {
  const extension = studentDocumentExtensions[file.type];
  if (!extension) {
    throw new Error("Unsupported student document type");
  }

  return `${userId}/${kind}/${crypto.randomUUID()}.${extension}`;
}

export async function validatePaymentReceipt(file: File) {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

  if (file.size === 0 || file.size > MAX_STUDENT_DOCUMENT_SIZE) {
    return {
      valid: false,
      message: "Payment receipt must be less than 5MB",
    };
  }

  if (
    !paymentReceiptRules.types.includes(file.type) ||
    !paymentReceiptRules.extensions.includes(extension)
  ) {
    return {
      valid: false,
      message: "Payment receipt must be PDF, JPG, or PNG",
    };
  }

  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (!matchesStudentDocumentSignature(bytes, file.type)) {
    return {
      valid: false,
      message: "Payment receipt file content is invalid",
    };
  }

  return { valid: true as const };
}

export function createPaymentReceiptPath(userId: string, paymentId: string, file: File) {
  const extension = studentDocumentExtensions[file.type];
  if (!extension) {
    throw new Error("Unsupported payment receipt type");
  }

  return `${userId}/${paymentId}/${crypto.randomUUID()}.${extension}`;
}

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain uppercase letter")
  .regex(/[a-z]/, "Password must contain lowercase letter")
  .regex(/[0-9]/, "Password must contain number");

const SignInSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const SignUpSchema = z
  .object({
    full_name: z.string().min(2, "Full name is required"),
    email: z.string().email("Invalid email address"),
    password: passwordSchema,
    student_type: z.enum(["new", "returning"], {
      error: "Student type is required",
    }),
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
    phone_number: z.string().min(10, "Valid phone number required"),
    passport_photo: z.instanceof(File, {
      message: "Passport photograph is required",
    }),
    school_id: z.instanceof(File).optional(),
    admission_letter: z.instanceof(File).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.student_type === "new" && data.school_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["school_id"],
        message: "New students cannot submit a school ID",
      });
    }
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
  student_type: "new" | "returning";
  level: 100 | 200 | 300 | 400 | 500 | 600;
  age: number;
  passport_photo: File;
  school_id?: File;
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
