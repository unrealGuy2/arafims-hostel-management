import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizationContext } from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);

export default async function ManagerPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getAuthorizationContext();

  if (!context || (context.role !== "manager" && context.role !== "master_admin")) {
    redirect("/signin");
  }
  if (context.mustChangePassword) {
    redirect("/manager/change-password");
  }

  const supabase = await createClient();
  const params = (await searchParams) ?? {};
  const selectedHostelId =
    context.role === "manager"
      ? context.assignedHostelId
      : typeof params.hostelId === "string"
        ? params.hostelId
        : undefined;
  const requestedStudentFilter =
    typeof params.studentFilter === "string" ? params.studentFilter : "unviewed";
  const studentFilter = ["all", "unviewed", "viewed"].includes(requestedStudentFilter)
    ? requestedStudentFilter
    : "unviewed";
  const studentSearch =
    typeof params.studentSearch === "string" ? params.studentSearch.trim() : "";
  const { data: hostels } = await supabase
    .from("hostels")
    .select("id, name")
    .order("name");
  const hostel = (hostels ?? []).find((item) => item.id === selectedHostelId) ??
    (context.role === "master_admin" ? hostels?.[0] : null);

  if (!hostel) {
    redirect("/signin");
  }

  const { data: rooms } = await supabase
    .from("rooms")
    .select("id, room_number, room_type, capacity")
    .eq("hostel_id", hostel.id);
  const roomIds = (rooms ?? []).map((room) => room.id);

  let matchingStudentIds: string[] | null = null;
  if (studentSearch) {
    const { data: matchingProfiles } = await supabase
      .from("student_profiles")
      .select("id")
      .ilike("full_name", `%${studentSearch}%`);
    matchingStudentIds = (matchingProfiles ?? []).map((profile) => profile.id);
  }

  let reservationsQuery = supabase
    .from("reservations")
    .select(
      "id, status, room_price, created_at, decision_reason, student_profiles!inner(id, full_name, email, phone_number, matric_number, gender, level, department, faculty, previous_hostel, manager_viewed_at), rooms(room_number, room_type, capacity), payments(id, amount_expected, payment_status, payment_reference, submitted_at, payment_proof_path, payment_receipt_path, rejection_reason)"
    )
    .in("room_id", roomIds)
    .order("created_at", { ascending: false });

  if (studentFilter === "unviewed") {
    reservationsQuery = reservationsQuery.is("student_profiles.manager_viewed_at", null);
  } else if (studentFilter === "viewed") {
    reservationsQuery = reservationsQuery.not(
      "student_profiles.manager_viewed_at",
      "is",
      null
    );
  }
  if (studentSearch) {
    reservationsQuery = reservationsQuery.in("student_profile_id", matchingStudentIds ?? []);
  }

  const noMatchingStudents = studentSearch && matchingStudentIds?.length === 0;
  const { data: reservations } = roomIds.length && !noMatchingStudents
    ? await reservationsQuery
    : { data: [] };
  const managerReservations = reservations ?? [];
  const result = typeof params.result === "string" ? params.result : undefined;
  const paymentResult =
    typeof params.paymentResult === "string" ? params.paymentResult : undefined;
  const bedspaceResult =
    typeof params.bedspaceResult === "string" ? params.bedspaceResult : undefined;
  const searchQuery =
    typeof params.bedspaceSearch === "string" ? params.bedspaceSearch.trim() : "";
  const selectedBedspaceRoomId =
    typeof params.bedspaceRoomId === "string" ? params.bedspaceRoomId : "";
  const selectedBedspaceRoom = (rooms ?? []).find(
    (room) => room.id === selectedBedspaceRoomId
  );
  const { data: bedspaceReservations } = roomIds.length
    ? await supabase
        .from("bedspace_pre_reservations")
        .select(
          "id, room_id, bedspace_number, student_name, student_phone, student_profile_id, status, rooms(room_number, room_type)"
        )
        .in("room_id", roomIds)
        .order("created_at", { ascending: false })
    : { data: [] };
  const filteredBedspaceReservations = (bedspaceReservations ?? []).filter((item) =>
    searchQuery
      ? item.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.student_phone.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  );
  const { data: searchedStudentProfiles } = searchQuery
    ? await supabase.rpc("manager_search_student_profiles", { p_query: searchQuery })
    : { data: [] };
  const studentProfiles = (searchedStudentProfiles ?? []) as Array<{
    id: string;
    full_name: string;
    phone_number: string | null;
  }>;

  return (
    <div className="min-h-screen bg-[#0f0f0f] px-4 py-12 text-[#f5f5f5] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link href="/dashboard" className="text-2xl font-bold text-[#10a574]">
            Arafims
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm transition-colors hover:border-[#10a574]/60"
          >
            Back to dashboard
          </Link>
          <Link
            href="/manager/payments"
            className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm transition-colors hover:border-[#10a574]/60"
          >
            Payment History
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6 md:p-8">
          <p className="mb-2 text-sm uppercase tracking-[0.2em] text-[#d4a574]">
            Manager dashboard
          </p>
          <h1 className="text-3xl font-bold font-display md:text-4xl">
            {hostel.name}
          </h1>
          <p className="mt-3 text-[#b8b8b8]">
            Hi, {context.displayName}. Review pending reservation applications for your assigned hostel.
          </p>
        </div>

        {result === "approved" && (
          <div className="mt-8 rounded-xl border border-[#10a574]/30 bg-[#10a574]/10 p-4 text-[#7ef1c6]">
            Reservation approved successfully.
          </div>
        )}
        {result === "rejected" && (
          <div className="mt-8 rounded-xl border border-[#d4a574]/30 bg-[#d4a574]/10 p-4 text-[#f5d5a4]">
            Reservation rejected successfully.
          </div>
        )}
        <form
          method="get"
          className="mt-8 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-4"
        >
          {context.role === "master_admin" && selectedHostelId && (
            <input type="hidden" name="hostelId" value={selectedHostelId} />
          )}
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <label className="flex-1 text-sm text-[#b8b8b8]">
              Search students
              <input
                name="studentSearch"
                defaultValue={studentSearch}
                placeholder="Search student by name..."
                className="mt-1 w-full rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-2 text-sm text-[#f5f5f5]"
              />
            </label>
            <label className="text-sm text-[#b8b8b8]">
              Applications
              <select
                name="studentFilter"
                defaultValue={studentFilter}
                className="mt-1 rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-2 text-sm text-[#f5f5f5]"
              >
                <option value="unviewed">Unviewed</option>
                <option value="all">All Students</option>
                <option value="viewed">Viewed</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded-lg bg-[#10a574] px-4 py-2 text-sm font-semibold text-[#0f0f0f]"
            >
              Apply
            </button>
          </div>
        </form>
        {paymentResult === "confirmed" && (
          <div className="mt-8 rounded-xl border border-[#10a574]/30 bg-[#10a574]/10 p-4 text-[#7ef1c6]">
            Payment confirmed successfully.
          </div>
        )}
        {paymentResult === "rejected" && (
          <div className="mt-8 rounded-xl border border-[#d4a574]/30 bg-[#d4a574]/10 p-4 text-[#f5d5a4]">
            Payment rejected successfully.
          </div>
        )}

        {context.role === "master_admin" && (
          <form method="get" className="mt-8 flex flex-wrap items-end gap-3">
            <label className="text-sm text-[#b8b8b8]">
              Hostel
              <select
                name="hostelId"
                defaultValue={hostel.id}
                className="mt-1 block rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-[#f5f5f5]"
              >
                {(hostels ?? []).map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <button className="rounded-lg border border-[#10a574]/40 px-4 py-2 text-sm text-[#7ef1c6]">
              View hostel
            </button>
          </form>
        )}

        {bedspaceResult && (
          <div className="mt-8 rounded-xl border border-[#10a574]/30 bg-[#10a574]/10 p-4 text-[#7ef1c6]">
            Bedspace reservation updated.
          </div>
        )}

        <section className="mt-8 rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6">
          <h2 className="text-2xl font-bold font-display">Bedspace Reservations</h2>
          <p className="mt-2 text-sm text-[#b8b8b8]">
            Hold individual bedspaces for students reserved through the hostel.
          </p>
          <form method="get" className="mt-5 flex flex-wrap items-end gap-3">
            {context.role === "manager" && <input type="hidden" name="hostelId" value={hostel.id} />}
            <label className="text-sm text-[#b8b8b8]">
              Room
              <select
                name="bedspaceRoomId"
                defaultValue={selectedBedspaceRoomId}
                className="mt-1 block rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-2 text-[#f5f5f5]"
              >
                <option value="">Select room</option>
                {(rooms ?? []).map((room) => (
                  <option key={room.id} value={room.id}>{room.room_number} · {room.room_type}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-[#b8b8b8]">
              Search name or phone
              <input
                name="bedspaceSearch"
                defaultValue={searchQuery}
                className="mt-1 block rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-2 text-[#f5f5f5]"
              />
            </label>
            <button className="rounded-lg border border-[#10a574]/40 px-4 py-2 text-sm text-[#7ef1c6]">
              Search
            </button>
          </form>

          {selectedBedspaceRoom && (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: selectedBedspaceRoom.capacity }, (_, index) => {
                const number = index + 1;
                const hold = (bedspaceReservations ?? []).find(
                  (item) =>
                    item.room_id === selectedBedspaceRoom.id &&
                    item.bedspace_number === number &&
                    item.status !== "released"
                );
                return (
                  <div key={number} className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] p-3">
                    <p className="font-semibold">Bedspace {number}</p>
                    {hold ? (
                      <>
                        <p className="mt-1 text-sm text-[#f5d5a4]">{hold.status}</p>
                        <p className="text-sm text-[#b8b8b8]">{hold.student_name}</p>
                        <p className="text-sm text-[#b8b8b8]">{hold.student_phone}</p>
                        <form action={`/api/manager/bedspace-pre-reservations/${hold.id}`} method="post" className="mt-3">
                          <input type="hidden" name="action" value="release" />
                          <button className="rounded-lg border border-red-400/40 px-3 py-2 text-xs text-red-200">Release</button>
                        </form>
                      </>
                    ) : (
                      <form action="/api/manager/bedspace-pre-reservations" method="post" className="mt-3 space-y-2">
                        <input type="hidden" name="roomId" value={selectedBedspaceRoom.id} />
                        <input type="hidden" name="bedspaceNumber" value={number} />
                        <input required name="studentName" placeholder="Student name" className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5]" />
                        <input required name="studentPhone" placeholder="Phone number" className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5]" />
                        <button className="rounded-lg bg-[#10a574] px-3 py-2 text-xs font-semibold text-[#0f0f0f]">Pre-reserve</button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {filteredBedspaceReservations.length > 0 && (
            <div className="mt-6 space-y-3">
              <h3 className="font-semibold">Existing pre-reservations</h3>
              {filteredBedspaceReservations.map((hold) => (
                <div key={hold.id} className="rounded-lg border border-[#2a2a2a] p-3 text-sm">
                  <p>{hold.student_name} · {hold.student_phone}</p>
                  <p className="text-[#b8b8b8]">
                    {(Array.isArray(hold.rooms) ? hold.rooms[0] : hold.rooms)?.room_number} · Bedspace {hold.bedspace_number} · {hold.status}
                  </p>
                  {!hold.student_profile_id && studentProfiles && studentProfiles.length > 0 && (
                    <form action={`/api/manager/bedspace-pre-reservations/${hold.id}`} method="post" className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="action" value="link" />
                      <label className="text-xs text-[#b8b8b8]">
                        Link student
                        <select name="studentProfileId" required className="mt-1 block rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-2 py-1 text-[#f5f5f5]">
                          {studentProfiles.map((profile) => (
                            <option key={profile.id} value={profile.id}>{profile.full_name} · {profile.phone_number}</option>
                          ))}
                        </select>
                      </label>
                      <button className="rounded-lg border border-[#10a574]/40 px-3 py-2 text-xs text-[#7ef1c6]">Link</button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="mt-8 space-y-6">
          {managerReservations.length === 0 ? (
            <div className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6 text-[#b8b8b8]">
              There are no pending reservations for {hostel.name}.
            </div>
          ) : (
            managerReservations.map((reservation) => {
              const student = Array.isArray(reservation.student_profiles)
                ? reservation.student_profiles[0]
                : reservation.student_profiles;
              const room = Array.isArray(reservation.rooms)
                ? reservation.rooms[0]
                : reservation.rooms;
              const payment = Array.isArray(reservation.payments)
                ? reservation.payments[0]
                : reservation.payments;

              return (
                <article
                  key={reservation.id}
                  className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-bold">{student?.full_name}</h2>
                      <p className="mt-1 text-[#b8b8b8]">{student?.email}</p>
                      {!student?.manager_viewed_at && (
                        <span className="mt-2 inline-block rounded-full border border-[#d4a574]/40 bg-[#d4a574]/10 px-2 py-1 text-xs text-[#f5d5a4]">
                          Unviewed
                        </span>
                      )}
                    </div>
                    <span className="rounded-full border border-[#d4a574]/30 bg-[#d4a574]/10 px-3 py-1 text-sm text-[#f5d5a4]">
                      {reservation.status}
                    </span>
                  </div>
                  <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div><dt className="text-[#888]">Matric number</dt><dd>{student?.matric_number}</dd></div>
                    <div><dt className="text-[#888]">Phone number</dt><dd>{student?.phone_number}</dd></div>
                    <div><dt className="text-[#888]">Gender</dt><dd>{student?.gender}</dd></div>
                    <div><dt className="text-[#888]">Level</dt><dd>{student?.level}</dd></div>
                    <div><dt className="text-[#888]">Department</dt><dd>{student?.department}</dd></div>
                    <div><dt className="text-[#888]">Faculty</dt><dd>{student?.faculty}</dd></div>
                    <div><dt className="text-[#888]">Previous hostel</dt><dd>{student?.previous_hostel || "None"}</dd></div>
                    <div><dt className="text-[#888]">Hostel</dt><dd>{hostel.name}</dd></div>
                    <div><dt className="text-[#888]">Room</dt><dd>{room?.room_number}</dd></div>
                    <div><dt className="text-[#888]">Room type</dt><dd>{room?.room_type}</dd></div>
                    <div><dt className="text-[#888]">Capacity</dt><dd>{room?.capacity}</dd></div>
                    <div><dt className="text-[#888]">Reservation price</dt><dd>{formatCurrency(Number(reservation.room_price))}</dd></div>
                    <div><dt className="text-[#888]">Application date</dt><dd>{new Date(reservation.created_at).toLocaleDateString()}</dd></div>
                  </dl>
                  {!student?.manager_viewed_at && student?.id && (
                    <form
                      action={`/api/manager/students/${student.id}/viewed`}
                      method="post"
                      className="mt-6"
                    >
                      <input type="hidden" name="filter" value={studentFilter} />
                      <input type="hidden" name="search" value={studentSearch} />
                      {selectedHostelId && (
                        <input type="hidden" name="hostelId" value={selectedHostelId} />
                      )}
                      <button
                        type="submit"
                        className="rounded-lg border border-[#10a574]/40 px-4 py-2 text-sm text-[#7ef1c6]"
                      >
                        Mark application as viewed
                      </button>
                    </form>
                  )}
                  {payment && (
                    <div className="mt-6 rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-4">
                      <h3 className="font-semibold">Payment</h3>
                      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                        <div><dt className="text-[#888]">Amount expected</dt><dd>{formatCurrency(Number(payment.amount_expected))}</dd></div>
                        <div><dt className="text-[#888]">Status</dt><dd>{payment.payment_status}</dd></div>
                        {payment.payment_reference && <div><dt className="text-[#888]">Payment reference</dt><dd>{payment.payment_reference}</dd></div>}
                        {payment.submitted_at && <div><dt className="text-[#888]">Submitted</dt><dd>{new Date(payment.submitted_at).toLocaleString()}</dd></div>}
                      </dl>
                      {payment.payment_status === "proof_submitted" && (
                        <div className="mt-4 flex flex-wrap gap-3">
                          {payment.payment_proof_path && (
                            <Link href={`/api/manager/payments/${payment.id}/proof`} className="rounded-lg border border-[#10a574]/40 px-4 py-2 text-sm text-[#7ef1c6]">
                              View payment proof
                            </Link>
                          )}
                          {payment.payment_receipt_path && (
                            <Link href={`/api/manager/payments/${payment.id}/receipt`} className="rounded-lg border border-[#d4a574]/40 px-4 py-2 text-sm text-[#f5d5a4]">
                              View payment receipt
                            </Link>
                          )}
                          <form action={`/api/manager/payments/${payment.id}`} method="post">
                            <input type="hidden" name="action" value="confirm" />
                            <button className="rounded-lg bg-[#10a574] px-4 py-2 text-sm font-semibold text-[#0f0f0f]">Confirm Payment</button>
                          </form>
                          <form action={`/api/manager/payments/${payment.id}`} method="post" className="flex flex-wrap gap-2">
                            <input type="hidden" name="action" value="reject" />
                            <input required name="reason" placeholder="Rejection reason" className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-[#f5f5f5]" />
                            <button className="rounded-lg border border-red-400/40 px-4 py-2 text-sm font-semibold text-red-200">Reject Payment</button>
                          </form>
                        </div>
                      )}
                      {payment.payment_status === "rejected" && payment.rejection_reason && (
                        <p className="mt-3 text-sm text-red-300">Rejection reason: {payment.rejection_reason}</p>
                      )}
                    </div>
                  )}
                  {reservation.status === "pending" && <div className="mt-6 flex flex-wrap gap-3">
                    <form action={`/api/manager/reservations/${reservation.id}`} method="post">
                      <input type="hidden" name="action" value="approve" />
                      <button className="rounded-lg bg-[#10a574] px-5 py-2.5 text-sm font-semibold text-[#0f0f0f]">
                        Approve
                      </button>
                    </form>
                    <form action={`/api/manager/reservations/${reservation.id}`} method="post" className="flex flex-wrap gap-2">
                      <input type="hidden" name="action" value="reject" />
                      <input
                        name="reason"
                        placeholder="Optional rejection reason"
                        className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-2 text-sm text-[#f5f5f5]"
                      />
                      <button className="rounded-lg border border-red-400/40 px-5 py-2.5 text-sm font-semibold text-red-200">
                        Reject
                      </button>
                    </form>
                  </div>}
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
