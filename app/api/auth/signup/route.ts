import { createClient } from "@supabase/supabase-js";
import { validateSignUp } from "@/lib/utils/validation";
import { validateAdmissionLetterRequired } from "@/lib/utils/validation";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const MAX_ADMISSION_LETTER_SIZE = 5242880;
const ALLOWED_ADMISSION_LETTER_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const data = {
      full_name: formData.get("full_name"),
      email: formData.get("email"),
      password: formData.get("password"),
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
      admission_letter: formData.get("admission_letter") || undefined,
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
      admission_letter,
    } = validation.data;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

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

    let admissionLetterPath: string | null = null;

    if (validateAdmissionLetterRequired(level)) {
      if (!admission_letter) {
        await supabase.auth.admin.deleteUser(authData.user.id);
        return NextResponse.json(
          { message: "Admission letter is required for level 100 students" },
          { status: 400 }
        );
      }

      if (admission_letter.size > MAX_ADMISSION_LETTER_SIZE) {
        await supabase.auth.admin.deleteUser(authData.user.id);
        return NextResponse.json(
          { message: "Admission letter must be less than 5MB" },
          { status: 400 }
        );
      }

      if (!ALLOWED_ADMISSION_LETTER_TYPES.includes(admission_letter.type)) {
        await supabase.auth.admin.deleteUser(authData.user.id);
        return NextResponse.json(
          { message: "Admission letter must be PDF, JPG, or PNG" },
          { status: 400 }
        );
      }

      const buffer = await admission_letter.arrayBuffer();
      const fileName = `${authData.user.id}/${Date.now()}-${admission_letter.name}`;

      const { error: storageError } = await supabase.storage
        .from("admission_letters")
        .upload(fileName, buffer, {
          contentType: admission_letter.type,
          cacheControl: "0",
          upsert: false,
        });

      if (storageError) {
        await supabase.auth.admin.deleteUser(authData.user.id);
        return NextResponse.json(
          { message: "Failed to upload admission letter" },
          { status: 500 }
        );
      }

      admissionLetterPath = fileName;
    }

    const { error: profileError } = await supabase
      .from("student_profiles")
      .insert({
        user_id: authData.user.id,
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
      });

    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      if (admissionLetterPath) {
        await supabase.storage
          .from("admission_letters")
          .remove([admissionLetterPath]);
      }
      return NextResponse.json(
        { message: "Failed to create student profile" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: "Signup successful" },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
