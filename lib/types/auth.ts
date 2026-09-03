export interface StudentProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  gender: "MALE" | "FEMALE";
  level: 100 | 200 | 300 | 400 | 500 | 600;
  department: string;
  faculty: string;
  age: number;
  previous_hostel: string | null;
  matric_number: string;
  guardian_name: string;
  guardian_phone: string;
  phone_number: string;
  admission_letter_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface SignUpFormData {
  full_name: string;
  email: string;
  password: string;
  gender: "MALE" | "FEMALE";
  level: 100 | 200 | 300 | 400 | 500 | 600;
  department: string;
  faculty: string;
  age: number;
  previous_hostel: string;
  matric_number: string;
  guardian_name: string;
  guardian_phone: string;
  phone_number: string;
  admission_letter?: File;
}

export interface SignInFormData {
  email: string;
  password: string;
}
