import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json(
        { error: "Please log in to view your enquiry history." },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Profile lookup failed:", profileError.message);
      return Response.json(
        { error: "Unable to verify customer account." },
        { status: 500 }
      );
    }

    if (!profile || profile.role !== "customer") {
      return Response.json(
        { error: "A customer account is required." },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from("leads")
      .select(
        "id, astrologer_id, subject, message, status, created_at"
      )
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Enquiry history fetch failed:", error.message);
      return Response.json(
        { error: "Unable to fetch enquiry history." },
        { status: 500 }
      );
    }

    return Response.json({ data: data ?? [] });
  } catch (error) {
    console.error("Enquiry history API error:", error);
    return Response.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
