import { createClient } from "@/lib/supabase/server";
import { validateEnquiryInput } from "@/lib/validations/enquiry";
import { checkRateLimit, extractClientIp } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  try {
    // 1. Abuse & Rate Limit Check by Client IP
    const clientIp = extractClientIp(request);
    const ipRateLimit = checkRateLimit(`enquiry:ip:${clientIp}`, 10, 60_000);
    if (!ipRateLimit.allowed) {
      return Response.json(
        { error: "Too many enquiries submitted. Please wait before trying again." },
        {
          status: 429,
          headers: { "Retry-After": String(ipRateLimit.retryAfterSeconds) },
        }
      );
    }

    // 2. Parse JSON body safely
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return Response.json(
        { error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    // 3. Schema validation, bounds, and sanitization
    const validation = validateEnquiryInput(rawBody);
    if (!validation.valid) {
      return Response.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    const input = validation.data;

    // 4. Authenticate caller and enforce 'customer' role using customer context
    const { requireCustomerContext } = await import("@/lib/auth/customer-guard");
    let customerCtx;
    try {
      customerCtx = await requireCustomerContext();
    } catch {
      return Response.json(
        { error: "Please log in as a customer to submit an enquiry." },
        { status: 401 }
      );
    }

    const { user, profile, target } = customerCtx;
    const supabase = await createClient(target);


    // User-level rate limiting
    const userRateLimit = checkRateLimit(`enquiry:user:${user.id}`, 5, 60_000);
    if (!userRateLimit.allowed) {
      return Response.json(
        { error: "Submission rate limit reached. Please wait a moment." },
        {
          status: 429,
          headers: { "Retry-After": String(userRateLimit.retryAfterSeconds) },
        }
      );
    }

    // 5. Execute canonical atomic transactional lead capture RPC
    // submit_customer_enquiry handles:
    // - Deduplication within 60s (concurrency-safe rollback)
    // - Target astrologer approval verification
    // - Platform settings direct routing policy resolution
    // - Atomic creation of lead, assignment, and assignment history in one transaction
    const { data: createdLead, error: rpcError } = await supabase.rpc(
      "submit_customer_enquiry",
      {
        p_subject: input.subject,
        p_message: input.message,
        p_astrologer_id: input.astrologer_id,
        p_source_type: input.source_type,
        p_source_url: input.source_url,
        p_utm_source: input.utm_source,
        p_utm_medium: input.utm_medium,
        p_utm_campaign: input.utm_campaign,
        p_customer_name: input.customer_name || profile.full_name,
        p_contact_email: input.contact_email || user.email,
        p_contact_phone: input.contact_phone,
        p_priority: input.priority,
      }
    );

    if (rpcError) {
      // Analyze PostgreSQL error codes
      if (rpcError.code === "23505" || rpcError.message.includes("identical enquiry")) {
        return Response.json(
          { error: "An identical enquiry was recently received. Please wait a moment before submitting again." },
          { status: 429 }
        );
      }

      if (rpcError.code === "P0002" || rpcError.message.includes("Approved astrologer")) {
        return Response.json(
          { error: "Approved astrologer listing not found." },
          { status: 404 }
        );
      }

      if (rpcError.code === "42501") {
        return Response.json(
          { error: "Permission denied." },
          { status: 403 }
        );
      }

      console.error("[Transactional Lead Capture RPC Error]", rpcError);
      return Response.json(
        { error: rpcError.message || "Failed to submit enquiry." },
        { status: 400 }
      );
    }

    return Response.json({ data: createdLead }, { status: 201 });
  } catch (error) {
    console.error("[Enquiry API Fatal Exception]", error);
    return Response.json(
      { error: "An unexpected error occurred while processing your enquiry." },
      { status: 500 }
    );
  }
}
