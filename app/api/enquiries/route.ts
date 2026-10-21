import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidUUID } from "@/lib/validations/lead";

type EnquiryBody = {
  astrologer_id?: unknown;
  subject?: unknown;
  message?: unknown;
  source_type?: unknown;
  source_url?: unknown;
  utm_source?: unknown;
  utm_medium?: unknown;
  utm_campaign?: unknown;
  customer_name?: unknown;
  contact_email?: unknown;
  contact_phone?: unknown;
  priority?: unknown;
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

    const {
      astrologer_id,
      subject,
      message,
      source_url,
      utm_source,
      utm_medium,
      utm_campaign,
      customer_name,
      contact_email,
      contact_phone,
      priority,
    } = body;

    // Validate subject & message
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

    // Determine lead type: direct or platform
    let targetAstrologerId: string | null = null;
    let isDirectLead = false;

    if (astrologer_id && typeof astrologer_id === "string") {
      if (!isValidUUID(astrologer_id)) {
        return Response.json(
          { error: "Valid astrologer_id is required." },
          { status: 400 }
        );
      }

      // Verify approved astrologer
      const { data: astrologer, error: astrologerError } = await supabase
        .from("astrologer_profiles")
        .select("id")
        .eq("id", astrologer_id)
        .eq("approval_status", "approved")
        .maybeSingle();

      if (astrologerError || !astrologer) {
        return Response.json(
          { error: "Approved astrologer not found." },
          { status: 404 }
        );
      }

      targetAstrologerId = astrologer.id;
      isDirectLead = true;
    }

    // Anti-duplication check: prevent duplicate submissions within 60 seconds
    const adminSupabase = await createAdminClient();
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();

    const { data: duplicateLead } = await adminSupabase
      .from("leads")
      .select("id")
      .eq("customer_id", user.id)
      .eq("subject", subject.trim())
      .gte("created_at", oneMinuteAgo)
      .maybeSingle();

    if (duplicateLead) {
      return Response.json(
        {
          error: "An identical enquiry was recently received. Please wait a moment before submitting again.",
          lead_id: duplicateLead.id,
        },
        { status: 429 }
      );
    }

    // Fetch direct lead routing policy from platform settings
    const { data: directPolicyRow } = await adminSupabase
      .from("platform_settings")
      .select("value")
      .eq("key", "direct_lead_routing_policy")
      .maybeSingle();

    const directRoutingPolicy = (directPolicyRow?.value as string) ?? "immediate_route";

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role, full_name")
      .eq("id", user.id)
      .maybeSingle();

    const validatedCustomerName =
      (typeof customer_name === "string" && customer_name.trim()) ||
      profile?.full_name ||
      "Platform Customer";

    // Direct lead status depends on policy:
    // If 'immediate_route', mark 'assigned'. If 'require_moderation', leave 'new' in central inbox.
    const shouldImmediatelyAssign = isDirectLead && directRoutingPolicy === "immediate_route";
    const initialStatus = shouldImmediatelyAssign ? "assigned" : "new";

    // Insert lead into central table
    const leadInsertPayload = {
      customer_id: user.id,
      astrologer_id: targetAstrologerId,
      subject: subject.trim(),
      message: message.trim(),
      status: initialStatus,
      source_type: isDirectLead ? "direct" : "platform",
      source_url: typeof source_url === "string" ? source_url.slice(0, 500) : null,
      utm_source: typeof utm_source === "string" ? utm_source.slice(0, 100) : null,
      utm_medium: typeof utm_medium === "string" ? utm_medium.slice(0, 100) : null,
      utm_campaign: typeof utm_campaign === "string" ? utm_campaign.slice(0, 100) : null,
      customer_name: validatedCustomerName,
      contact_email: typeof contact_email === "string" ? contact_email.trim() : user.email ?? null,
      contact_phone: typeof contact_phone === "string" ? contact_phone.trim() : null,
      priority: typeof priority === "string" && ["low", "medium", "high", "urgent"].includes(priority) ? priority : "medium",
      qualification_status: "unqualified",
    };

    const { data: lead, error: insertError } = await adminSupabase
      .from("leads")
      .insert(leadInsertPayload)
      .select("*")
      .single();

    if (insertError || !lead) {
      console.error("Lead creation failed:", insertError?.message);
      return Response.json(
        { error: "Unable to create enquiry. Please try again." },
        { status: 500 }
      );
    }

    // If direct lead and immediate routing policy is active, create assignment and record initial assignment history
    if (shouldImmediatelyAssign && targetAstrologerId) {
      const { error: assignError } = await adminSupabase.from("lead_assignments").insert({
        lead_id: lead.id,
        astrologer_id: targetAstrologerId,
        status: "assigned",
      });

      if (assignError) {
        console.error("Direct lead assignment record failed:", assignError.message);
      }

      const { error: histError } = await adminSupabase.from("lead_assignment_history").insert({
        lead_id: lead.id,
        new_astrologer_id: targetAstrologerId,
        action: "assign",
        reason: "Direct customer enquiry to listing (immediate_route policy)",
      });

      if (histError) {
        console.error("Direct lead assignment history failed:", histError.message);
      }
    }

    return Response.json({ data: lead }, { status: 201 });
  } catch (error) {
    console.error("Enquiry API error:", error);
    return Response.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
