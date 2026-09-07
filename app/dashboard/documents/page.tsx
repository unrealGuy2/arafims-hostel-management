import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Documents | Arafims",
  description: "View your Arafims student documents",
};

export default async function DocumentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/signin");
  }

  const { data: profile } = await supabase
    .from("student_profiles")
    .select("passport_photo_path, school_id_path, admission_letter_path")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    redirect("/signin");
  }

  const documents = [
    {
      name: "Passport photograph",
      bucket: "passport_photos",
      path: profile.passport_photo_path,
    },
    {
      name: "School ID",
      bucket: "school_ids",
      path: profile.school_id_path,
    },
    {
      name: "Admission letter",
      bucket: "admission_letters",
      path: profile.admission_letter_path,
    },
  ];

  const documentLinks = await Promise.all(
    documents.map(async (document) => {
      if (!document.path) {
        return { ...document, url: null };
      }

      const { data } = await supabase.storage
        .from(document.bucket)
        .createSignedUrl(document.path, 300);

      return { ...document, url: data?.signedUrl ?? null };
    })
  );

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-[#d4a574]">
            Student account
          </p>
          <h1 className="mt-2 text-3xl font-bold font-display sm:text-4xl">
            Documents
          </h1>
          <p className="mt-2 text-[#b8b8b8]">
            Access the documents submitted with your student profile.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {documentLinks.map((document) => (
            <section
              key={document.name}
              className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6"
            >
              <p className="text-sm uppercase tracking-[0.12em] text-[#d4a574]">
                Document
              </p>
              <h2 className="mt-3 text-xl font-bold font-display">
                {document.name}
              </h2>
              <p className="mt-3 text-sm text-[#b8b8b8]">
                {document.path ? "Uploaded" : "Not provided"}
              </p>
              {document.url && (
                <Link
                  href={document.url}
                  target="_blank"
                  className="mt-6 inline-flex rounded-lg bg-[#10a574] px-4 py-2 text-sm font-semibold text-[#0f0f0f] transition-colors hover:bg-[#1ec98c]"
                >
                  View document
                </Link>
              )}
            </section>
          ))}
        </div>

        <Link
          href="/dashboard"
          className="mt-8 inline-flex rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-[#f5f5f5] transition-colors hover:border-[#10a574]/60"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
