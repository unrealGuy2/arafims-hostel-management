import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);

const compareRoomNumbers = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

const HOSTEL_GENDER_RESTRICTIONS: Record<string, "MALE" | "FEMALE" | "ANY"> = {
  "arafims-1": "MALE",
  "arafims-2": "MALE",
  "zamfara-pg": "ANY",
};

function isHostelEligible(slug: string, gender: string) {
  const restriction = HOSTEL_GENDER_RESTRICTIONS[slug] ?? "ANY";
  return restriction === "ANY" || restriction === gender;
}

function getHostelRestrictionLabel(slug: string) {
  const restriction = HOSTEL_GENDER_RESTRICTIONS[slug] ?? "ANY";
  return restriction === "ANY" ? "Male and female students" : `${restriction} students only`;
}

function getAvailabilityStatus(capacity: number, occupied: number) {
  const available = capacity - occupied;

  if (available <= 0) {
    return {
      label: "Full",
      tone: "border-[#555]/40 bg-[#555]/10 text-[#b8b8b8]",
      available,
    };
  }

  if (occupied === 0) {
    return {
      label: "Available",
      tone: "border-[#10a574]/30 bg-[#10a574]/10 text-[#7ef1c6]",
      available,
    };
  }

  return {
    label: "Partially Available",
    tone: "border-[#d4a574]/30 bg-[#d4a574]/10 text-[#f5d5a4]",
    available,
  };
}

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const selectedHostelSlug =
    typeof params.hostel === "string" ? params.hostel : undefined;
  const selectedRoomId =
    typeof params.roomId === "string" ? params.roomId : undefined;
  const submitted =
    typeof params.submitted === "string" && params.submitted === "success";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/signin");
  }

  const { data: profile } = await supabase
    .from("student_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    redirect("/signin");
  }

  const { data: hostels } = await supabase
    .from("hostels")
    .select("*")
    .eq("active", true)
    .order("name");

  let selectedHostel = null;
  let selectedHostelEligible = true;

  if (selectedHostelSlug) {
    const { data: hostel } = await supabase
      .from("hostels")
      .select("*")
      .eq("slug", selectedHostelSlug)
      .eq("active", true)
      .single();

    selectedHostel = hostel;
    selectedHostelEligible = hostel
      ? isHostelEligible(hostel.slug, profile.gender)
      : false;
  }

  let selectedRoom = null;
  let roomAvailability = 0;
  let roomOccupied = 0;

  if (selectedRoomId) {
    const { data: room } = await supabase
      .from("rooms")
      .select("*, hostel:hostel_id(*)")
      .eq("id", selectedRoomId)
      .single();

    selectedRoom = room;

    if (selectedRoom) {
      const { data: availabilityData } = await supabase.rpc("room_availability", {
        p_room_id: selectedRoom.id,
      });

      const availability = availabilityData?.[0];
      roomOccupied = availability?.occupied_count ?? 0;
      roomAvailability = availability?.available_count ?? 0;
    }
  }

  let roomCards: any[] = [];

  if (selectedHostel) {
    const { data: rooms } = await supabase
      .from("rooms")
      .select("*")
      .eq("hostel_id", selectedHostel.id)
      .eq("active", true)
      .order("room_number");

    const sortedRooms = (rooms ?? []).sort((a, b) =>
      compareRoomNumbers(a.room_number, b.room_number)
    );

    const { data: availabilityRows } = await supabase.rpc(
      "room_availability_for_hostel",
      { p_hostel_id: selectedHostel.id }
    );

    const availabilityMap = new Map<
      string,
      {
        room_id: string;
        occupied_count: number;
        pre_reserved_count: number;
        available_count: number;
      }
    >(
      ((availabilityRows ?? []) as Array<{
        room_id: string;
        occupied_count: number;
        pre_reserved_count: number;
        available_count: number;
      }>).map((entry) => [entry.room_id, entry])
    );

    roomCards = sortedRooms.map((room) => {
      const availability = availabilityMap.get(room.id);
      const occupied = availability?.occupied_count ?? room.capacity;
      const available = availability?.available_count ?? 0;
      const status = getAvailabilityStatus(room.capacity, occupied);

      return {
        ...room,
        occupied,
        preReserved: availability?.pre_reserved_count ?? 0,
        available,
        status,
      };
    });
  }

  const canReserveSelectedRoom =
    selectedRoom &&
    selectedHostelEligible &&
    roomAvailability > 0 &&
    (selectedRoom.gender_restriction === "ANY" ||
      selectedRoom.gender_restriction === profile.gender);

  return (
    <div className="min-h-screen bg-[#0f0f0f] px-4 py-12 text-[#f5f5f5] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link href="/dashboard" className="text-2xl font-bold text-[#10a574]">
            Arafims
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-[#f5f5f5] transition-colors hover:border-[#10a574]/60"
          >
            Back to dashboard
          </Link>
        </div>

        <div className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6 md:p-8">
          <p className="mb-2 text-sm uppercase tracking-[0.2em] text-[#d4a574]">
            Reservation flow
          </p>
          <h1 className="text-3xl font-bold font-display md:text-4xl">
            Apply for Reservation
          </h1>
        </div>

        {submitted && (
          <div className="mt-8 rounded-2xl border border-[#10a574]/30 bg-[#10a574]/10 p-5 text-[#7ef1c6]">
            Your reservation application was submitted and is pending manager approval.
          </div>
        )}

        {!selectedHostel && (
          <div className="mt-8">
            <div className="mb-5">
              <h2 className="text-2xl font-bold font-display">Select a hostel</h2>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {(hostels ?? []).map((hostelItem) => {
                const eligible = isHostelEligible(hostelItem.slug, profile.gender);
                const content = (
                  <>
                  <p className="text-sm uppercase tracking-[0.2em] text-[#d4a574]">
                    Hostel
                  </p>
                  <h3 className="mt-3 text-2xl font-bold font-display">
                    {hostelItem.name}
                  </h3>
                  <p className="mt-3 text-sm text-[#b8b8b8]">
                    {hostelItem.description}
                  </p>
                  <p className="mt-2 text-sm text-[#b8b8b8]">
                    {getHostelRestrictionLabel(hostelItem.slug)}
                  </p>
                  <div className="mt-6 inline-flex items-center rounded-lg bg-[#10a574] px-4 py-2 text-sm font-semibold text-[#0f0f0f]">
                    {eligible ? "View rooms" : "Not eligible"}
                  </div>
                  </>
                );

                return eligible ? (
                  <Link
                    key={hostelItem.id}
                    href={`/dashboard/reservations?hostel=${hostelItem.slug}`}
                    className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6 transition-transform duration-200 hover:-translate-y-1 hover:border-[#10a574]/60"
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    key={hostelItem.id}
                    className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6 opacity-70"
                  >
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {selectedHostel && !selectedRoom && (
          <div className="mt-8">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-[#d4a574]">
                  Selected hostel
                </p>
                <h2 className="text-2xl font-bold font-display">
                  {selectedHostel.name}
                </h2>
              </div>
              <Link
                href="/dashboard/reservations"
                className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-[#f5f5f5] transition-colors hover:border-[#10a574]/60"
              >
                Change hostel
              </Link>
            </div>
            {!selectedHostelEligible && (
              <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-200">
                This hostel is restricted to {getHostelRestrictionLabel(selectedHostel.slug).toLowerCase()}.
              </div>
            )}

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {roomCards.map((room) => (
                <div
                  key={room.id}
                  className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm uppercase tracking-[0.2em] text-[#d4a574]">
                        Room
                      </p>
                      <h3 className="mt-2 text-2xl font-bold font-display">
                        {room.room_number}
                      </h3>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] ${room.status.tone}`}
                    >
                      {room.status.label}
                    </span>
                  </div>

                  <div className="mt-5 space-y-3 text-sm text-[#b8b8b8]">
                    <p>Capacity: {room.capacity}</p>
                    <p>Price: {formatCurrency(room.price)}</p>
                    <p>Available: {room.available}</p>
                    <p>Pre-reserved: {room.preReserved}</p>
                    <p>
                      Gender: {room.gender_restriction === "ANY" ? "Open" : room.gender_restriction}
                    </p>
                  </div>

                  <div className="mt-6">
                    {room.available > 0 ? (
                      <Link
                        href={`/dashboard/reservations?hostel=${selectedHostel.slug}&roomId=${room.id}`}
                        className="inline-flex w-full items-center justify-center rounded-lg bg-[#10a574] px-4 py-3 text-sm font-semibold text-[#0f0f0f] transition-colors hover:bg-[#1ec98c]"
                      >
                        Select room
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-4 py-3 text-sm font-semibold text-[#b8b8b8]"
                      >
                        Full
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedHostel && selectedRoom && (
          <div className="mt-8 rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6 md:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-[#d4a574]">
                  Review reservation
                </p>
                <h2 className="mt-2 text-2xl font-bold font-display">
                  {selectedHostel.name} · Room {selectedRoom.room_number}
                </h2>
              </div>
              <Link
                href={`/dashboard/reservations?hostel=${selectedHostel.slug}`}
                className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-[#f5f5f5] transition-colors hover:border-[#10a574]/60"
              >
                Change room
              </Link>
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-[#2a2a2a] bg-[#0f0f0f] p-5">
                <h3 className="text-lg font-bold font-display">Room details</h3>
                <dl className="mt-4 space-y-3 text-[#b8b8b8]">
                  <div className="flex items-center justify-between gap-3">
                    <dt>Room type</dt>
                    <dd>{selectedRoom.room_type}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>Capacity</dt>
                    <dd>{selectedRoom.capacity}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>Price</dt>
                    <dd>{formatCurrency(selectedRoom.price)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>Availability</dt>
                    <dd>{roomAvailability}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>Gender</dt>
                    <dd>
                      {selectedRoom.gender_restriction === "ANY"
                        ? "Open"
                        : selectedRoom.gender_restriction}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-2xl border border-[#2a2a2a] bg-[#0f0f0f] p-5">
                <h3 className="text-lg font-bold font-display">Student profile</h3>
                <dl className="mt-4 space-y-3 text-[#b8b8b8]">
                  <div className="flex items-center justify-between gap-3">
                    <dt>Name</dt>
                    <dd>{profile.full_name}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>Email</dt>
                    <dd>{profile.email}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>Gender</dt>
                    <dd>{profile.gender}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>Level</dt>
                    <dd>{profile.level}</dd>
                  </div>
                </dl>
              </div>
            </div>

            {!canReserveSelectedRoom && (
              <div className="mt-6 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-200">
                This room is unavailable for your student profile at the moment.
              </div>
            )}

            <form action="/api/reservations" method="post" className="mt-8">
              <input type="hidden" name="roomId" value={selectedRoom.id} />
              <button
                type="submit"
                disabled={!canReserveSelectedRoom}
                className="inline-flex w-full items-center justify-center rounded-lg bg-[#10a574] px-5 py-3 text-base font-semibold text-[#0f0f0f] transition-colors hover:bg-[#1ec98c] disabled:cursor-not-allowed disabled:bg-[#0d8a5f] disabled:text-[#d8d8d8]"
              >
                Submit reservation
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
