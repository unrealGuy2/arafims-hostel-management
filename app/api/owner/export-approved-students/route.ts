import { getAuthorizationContext } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";
import * as XLSX from "xlsx";
import { NextResponse } from "next/server";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export async function GET() {
  const context = await getAuthorizationContext();

  if (!context || context.role !== "master_admin") {
    return NextResponse.json({ message: "Not authorized" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: reservations, error } = await supabase
    .from("reservations")
    .select(
      "id, status, room_price, created_at, updated_at, student_profiles(full_name, email, matric_number, gender, level, department, faculty, age, previous_hostel, guardian_name, guardian_phone), rooms(room_number, room_type, room_category, capacity, price, hostels(name))"
    )
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  if (!reservations || reservations.length === 0) {
    return NextResponse.json(
      { message: "No approved reservations available for export" },
      { status: 404 }
    );
  }

  const rows = reservations.map((reservation) => {
    const student = Array.isArray(reservation.student_profiles)
      ? reservation.student_profiles[0]
      : reservation.student_profiles;
    const room = Array.isArray(reservation.rooms) ? reservation.rooms[0] : reservation.rooms;
    const hostel = room?.hostels;
    const hostelName = hostel && "name" in hostel ? hostel.name : undefined;

    return {
      "Full Name": student?.full_name,
      "Matric Number": student?.matric_number,
      Email: student?.email,
      Gender: student?.gender,
      Level: student?.level,
      Department: student?.department,
      Faculty: student?.faculty,
      Age: student?.age,
      "Previous Hostel": student?.previous_hostel,
      "Guardian Name": student?.guardian_name,
      "Guardian Phone": student?.guardian_phone,
      Hostel: hostelName,
      "Room Number": room?.room_number,
      "Room Type": room?.room_type,
      "Room Category": room?.room_category,
      Capacity: room?.capacity,
      "Room Price": Number(room?.price ?? 0),
      "Reservation Status": reservation.status,
      "Application Date": formatDate(reservation.created_at),
      "Approved/Updated Date": formatDate(reservation.updated_at),
    };
  });

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  worksheet["!autofilter"] = { ref: `A1:T${rows.length + 1}` };
  worksheet["!cols"] = [
    { wch: 24 }, { wch: 18 }, { wch: 30 }, { wch: 10 }, { wch: 8 },
    { wch: 22 }, { wch: 18 }, { wch: 8 }, { wch: 18 }, { wch: 22 },
    { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 16 },
    { wch: 10 }, { wch: 16 }, { wch: 18 }, { wch: 22 }, { wch: 22 },
  ];
  const headerStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "0F766E" } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
  };
  const columnCount = 20;
  for (let column = 0; column < columnCount; column += 1) {
    const cell = XLSX.utils.encode_cell({ r: 0, c: column });
    if (worksheet[cell]) worksheet[cell].s = headerStyle;
  }
  for (let row = 1; row <= rows.length; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      const cell = XLSX.utils.encode_cell({ r: row, c: column });
      if (worksheet[cell]) {
        worksheet[cell].s = {
          alignment: { vertical: "top", wrapText: true },
        };
      }
    }
    const roomPriceCell = worksheet[`Q${row + 1}`];
    if (roomPriceCell) roomPriceCell.z = '"₦"#,##0.00';
  }
  XLSX.utils.book_append_sheet(workbook, worksheet, "Approved Students");
  const file = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    cellStyles: true,
  });

  return new NextResponse(file, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="arafims-approved-students.xlsx"',
    },
  });
}
