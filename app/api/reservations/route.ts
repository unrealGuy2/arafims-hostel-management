import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const HOSTEL_GENDER_RESTRICTIONS: Record<string, "MALE" | "FEMALE" | "ANY"> = {
  "arafims-1": "MALE",
  "arafims-2": "MALE",
  "zamfara-pg": "ANY",
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  const { data: profile } = await supabase
    .from("student_profiles")
    .select("id, gender")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  const { data: existingReservation, error: existingReservationError } =
    await supabase
      .from("reservations")
      .select("id, status")
      .eq("student_profile_id", profile.id)
      .neq("status", "rejected")
      .limit(1)
      .maybeSingle();

  if (existingReservationError) {
    return NextResponse.json(
      { message: "Unable to verify reservation eligibility" },
      { status: 500 }
    );
  }

  if (existingReservation) {
    return NextResponse.json(
      { message: "You already have an active reservation" },
      { status: 409 }
    );
  }

  const formData = await request.formData();
  const roomId = String(formData.get("roomId") ?? "").trim();

  if (!roomId) {
    return NextResponse.json({ message: "Invalid room selection" }, { status: 400 });
  }

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, room_number, price, capacity, gender_restriction, active, hostel:hostel_id(slug, name)")
    .eq("id", roomId)
    .single();

  if (roomError || !room || !room.active) {
    return NextResponse.json({ message: "This room is unavailable" }, { status: 400 });
  }

  const hostel = Array.isArray(room.hostel) ? room.hostel[0] : room.hostel;
  const hostelRestriction = hostel ? HOSTEL_GENDER_RESTRICTIONS[hostel.slug] ?? "ANY" : "ANY";

  if (hostelRestriction !== "ANY" && hostelRestriction !== profile.gender) {
    return NextResponse.json(
      { message: `${hostel.name} is restricted to ${hostelRestriction.toLowerCase()} students` },
      { status: 400 }
    );
  }

  if (room.gender_restriction !== "ANY" && room.gender_restriction !== profile.gender) {
    return NextResponse.json(
      { message: "This room does not match your gender profile" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.rpc("create_reservation", {
    p_student_profile_id: profile.id,
    p_room_id: room.id,
  });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return NextResponse.redirect(
    new URL("/dashboard/reservations?submitted=success", request.url)
  );
}
