import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createStudentDocumentPath,
  validateAdmissionLetterRequired,
  validateSignUp,
  validateStudentDocument,
} from "@/lib/utils/validation";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const MAX_ADMISSION_LETTER_SIZE = 5242880;
const ALLOWED_ADMISSION_LETTER_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];

type UploadedFile = {
  bucket: string;
  path: string;
};

function getFormFile(formData: FormData, name: string) {
  const value = formData.get(name);
  return value instanceof File && value.size > 0 ? value : undefined;
}

export async function POST(request: Request) {
  let supabase: SupabaseClient | null = null;
  let createdUserId: string | null = null;
  const uploadedFiles: UploadedFile[] = [];

  const cleanup = async () => {
    if (supabase) {
      for (const file of uploadedFiles) {
        try {
          await supabase.storage.from(file.bucket).remove([file.path]);
        } catch {
          continue;
        }
      }
      if (createdUserId) {
        try {
          await supabase.auth.admin.deleteUser(createdUserId);
        } catch {
          return;
        }
      }
    }
  };

  const failureAfterAuth = async (message: string, status: number) => {
    await cleanup();
    return NextResponse.json({ message }, { status });
  };

  try {
    const formData = await request.formData();

    const data = {
      full_name: formData.get("full_name"),
      email: formData.get("email"),
      password: formData.get("password"),
      student_type: formData.get("student_type"),
      gender: formData.get("gender"),
      level: formData.get("level") ? String(formData.get("level")) : undefined,
      department: formData.get("department"),
      faculty: formData.get("faculty"),
      age: formData.get("age")
        ? parseInt(formData.get("age") as string)
        : undefined,
      previous_hostel: formData.get("previous_hostel"),
      matric_number: formData.get("matric_number"),
      guardian_name: formData.get("guardian_name"),
      guardian_phone: formData.get("guardian_phone"),
      phone_number: formData.get("phone_number"),
      passport_photo: getFormFile(formData, "passport_photo"),
      school_id: getFormFile(formData, "school_id"),
      admission_letter: getFormFile(formData, "admission_letter"),
    };

    const validation = validateSignUp(data);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.issues.forEach((issue: any) => {
        const path = issue.path[0] || "general";
        errors[path] = issue.message;
      });
      return NextResponse.json({ errors }, { status: 400 });
    }

    const {
      full_name,
      email,
      password,
      gender,
      level,
      department,
      faculty,
      age,
      previous_hostel,
      matric_number,
      guardian_name,
      guardian_phone,
      phone_number,
      passport_photo,
      school_id,
      admission_letter,
    } = validation.data;

    const passportValidation = await validateStudentDocument(
      passport_photo,
      "passport_photo"
    );
    if (!passportValidation.valid) {
      return NextResponse.json(
        { errors: { passport_photo: passportValidation.message } },
        { status: 400 }
      );
    }

    if (school_id) {
      const schoolIdValidation = await validateStudentDocument(
        school_id,
        "school_id"
      );
      if (!schoolIdValidation.valid) {
        return NextResponse.json(
          { errors: { school_id: schoolIdValidation.message } },
          { status: 400 }
        );
      }
    }

    supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: existingUser } = await supabase
      .from("student_profiles")
      .select("id")
      .eq("email", email)
      .single();

    if (existingUser) {
      return NextResponse.json(
        { message: "Email already registered" },
        { status: 409 }
      );
    }

    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError || !authData.user) {
      return NextResponse.json(
        { message: authError?.message || "Failed to create account" },
        { status: 400 }
      );
    }

    createdUserId = authData.user.id;

    const passportPhotoPath = createStudentDocumentPath(
      createdUserId,
      "passport_photo",
      passport_photo
    );
    const { error: passportUploadError } = await supabase.storage
      .from("passport_photos")
      .upload(passportPhotoPath, await passport_photo.arrayBuffer(), {
        contentType: passport_photo.type,
        cacheControl: "0",
        upsert: false,
      });

    if (passportUploadError) {
      return failureAfterAuth("Failed to upload passport photograph", 500);
    }
    uploadedFiles.push({ bucket: "passport_photos", path: passportPhotoPath });

    let schoolIdPath: string | null = null;
    if (school_id) {
      schoolIdPath = createStudentDocumentPath(
        createdUserId,
        "school_id",
        school_id
      );
      const { error: schoolIdUploadError } = await supabase.storage
        .from("school_ids")
        .upload(schoolIdPath, await school_id.arrayBuffer(), {
          contentType: school_id.type,
          cacheControl: "0",
          upsert: false,
        });

      if (schoolIdUploadError) {
        return failureAfterAuth("Failed to upload school ID", 500);
      }
      uploadedFiles.push({ bucket: "school_ids", path: schoolIdPath });
    }

    let admissionLetterPath: string | null = null;

    if (validateAdmissionLetterRequired(level)) {
      if (!admission_letter) {
        return failureAfterAuth(
          "Admission letter is required for level 100 students",
          400
        );
      }

      if (admission_letter.size > MAX_ADMISSION_LETTER_SIZE) {
        return failureAfterAuth(
          "Admission letter must be less than 5MB",
          400
        );
      }

      if (!ALLOWED_ADMISSION_LETTER_TYPES.includes(admission_letter.type)) {
        return failureAfterAuth(
          "Admission letter must be PDF, JPG, or PNG",
          400
        );
      }

      const buffer = await admission_letter.arrayBuffer();
      const fileName = `${createdUserId}/${Date.now()}-${admission_letter.name}`;

      const { error: storageError } = await supabase.storage
        .from("admission_letters")
        .upload(fileName, buffer, {
          contentType: admission_letter.type,
          cacheControl: "0",
          upsert: false,
        });

      if (storageError) {
        return failureAfterAuth("Failed to upload admission letter", 500);
      }

      admissionLetterPath = fileName;
      uploadedFiles.push({ bucket: "admission_letters", path: fileName });
    }

    const { error: profileError } = await supabase
      .from("student_profiles")
      .insert({
        user_id: createdUserId,
        full_name,
        email,
        gender,
        level,
        department,
        faculty,
        age,
        previous_hostel,
        matric_number,
        guardian_name,
        guardian_phone,
        phone_number,
        admission_letter_path: admissionLetterPath,
        passport_photo_path: passportPhotoPath,
        school_id_path: schoolIdPath,
      });

    if (profileError) {
      return failureAfterAuth("Failed to create student profile", 500);
    }

    return NextResponse.json(
      { message: "Signup successful" },
      { status: 201 }
    );
  } catch {
    await cleanup();
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
