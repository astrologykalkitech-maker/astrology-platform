import { createClient } from "@/lib/supabase/server";

type EnquiryBody = {
  astrologer_id?: unknown;
  subject?: unknown;
  message?: unknown;
};

export async function POST(request: Request) {
  try {
    let body: EnquiryBody;

    try {
      body = (await request.json()) as EnquiryBody;
    } catch {
      return Response.json(
        { error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    const { astrologer_id, subject, message } = body;

    if (
      typeof astrologer_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(astrologer_id)
    ) {
      return Response.json(
        { error: "Valid astrologer_id is required." },
        { status: 400 }
      );
    }

    if (
      typeof subject !== "string" ||
      !subject.trim() ||
      subject.trim().length > 200
    ) {
      return Response.json(
        { error: "Subject is required and must be at most 200 characters." },
        { status: 400 }
      );
    }

    if (
      typeof message !== "string" ||
      !message.trim() ||
      message.trim().length > 5000
    ) {
      return Response.json(
        { error: "Message is required and must be at most 5000 characters." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json(
        { error: "Please log in to submit an enquiry." },
        { status: 401 }
      );
    }

    const { data: astrologer, error: astrologerError } = await supabase
      .from("astrologer_profiles")
      .select("id")
      .eq("id", astrologer_id)
      .eq("approval_status", "approved")
      .maybeSingle();

    if (astrologerError) {
      console.error("Astrologer lookup failed:", astrologerError.message);
      return Response.json(
        { error: "Unable to verify astrologer." },
        { status: 500 }
      );
    }

    if (!astrologer) {
      return Response.json(
        { error: "Approved astrologer not found." },
        { status: 404 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Customer profile lookup failed:", profileError.message);
      return Response.json(
        { error: "Unable to verify customer profile." },
        { status: 500 }
      );
    }

    if (!profile || profile.role !== "customer") {
      return Response.json(
        { error: "A customer account is required to submit an enquiry." },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from("leads")
      .insert({
        customer_id: user.id,
        astrologer_id,
        subject: subject.trim(),
        message: message.trim(),
        status: "new",
      })
      .select("id, customer_id, astrologer_id, subject, message, status, created_at")
      .single();

    if (error) {
      console.error("Enquiry creation failed:", error.message);
      return Response.json(
        { error: "Unable to create enquiry. Please check your account permissions." },
        { status: 500 }
      );
    }

    return Response.json({ data }, { status: 201 });
  } catch (error) {
    console.error("Enquiry API error:", error);
    return Response.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
