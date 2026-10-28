/**
 * POST /api/consultation-token
 *
 * Generates a signed JaaS JWT for an authenticated consultation room.
 * Only accessible to logged-in customers OR astrologers who are verified
 * parties to the room (booking or lead enquiry).
 *
 * Request body:
 *   { roomId: string; role?: "customer" | "astrologer" }
 *
 * Response:
 *   { token: string; roomUrl: string; appId: string; roomName: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  generateJaasToken,
  buildJaasRoomUrl,
  sanitiseRoomName,
} from "@/lib/jaas/generateJaasToken";

export const runtime = "nodejs"; // jose importPKCS8 requires Node.js crypto

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { roomId } = (body || {}) as { roomId?: string; role?: string };

    if (!roomId || typeof roomId !== "string" || roomId.trim().length === 0) {
      return NextResponse.json({ error: "roomId is required" }, { status: 400 });
    }

    const appId = process.env.JAAS_APP_ID;
    const keyId = process.env.JAAS_KEY_ID;
    const privateKey = process.env.JAAS_PRIVATE_KEY;

    if (!appId || !keyId || !privateKey) {
      return NextResponse.json(
        { error: "JaaS video consultation is not configured on server" },
        { status: 503 }
      );
    }

    // Authenticate the caller via Supabase session
    const supabase = await createClient("main");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Per-user rate limiting: max 10 token generations per minute
    const rateLimit = checkRateLimit(`jaas:token:${user.id}`, 10, 60_000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Too many token requests. Please wait ${rateLimit.retryAfterSeconds} seconds before trying again.`,
        },
        { status: 429 }
      );
    }

    const adminClient = await createAdminClient("main");

    // Resolve caller's astrologer profile if any
    const { data: astroProfile } = await adminClient
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    let isAuthorized = false;
    let isModerator = false;
    let tokenExpirySeconds = 7200; // default 2 hours

    // 1. Check if roomId corresponds to a customer_bookings record
    const { data: booking } = await adminClient
      .from("customer_bookings")
      .select("id, customer_id, astrologer_id, status, scheduled_at, duration_minutes, consultation_mode")
      .eq("id", roomId)
      .maybeSingle();

    if (booking) {
      const isCustomer = booking.customer_id === user.id;
      const isAstrologer = astroProfile ? booking.astrologer_id === astroProfile.id : false;

      if (!isCustomer && !isAstrologer) {
        return NextResponse.json(
          { error: "You are not an authorized participant in this consultation" },
          { status: 403 }
        );
      }

      if (booking.status === "cancelled" || booking.status === "no_show") {
        return NextResponse.json(
          { error: `Cannot join consultation room for booking with status: ${booking.status}` },
          { status: 403 }
        );
      }

      // Schedule window verification: allow joining 15 minutes before scheduled_at until duration + 60 min
      if (booking.scheduled_at) {
        const scheduledTime = new Date(booking.scheduled_at).getTime();
        const durationMs = (booking.duration_minutes || 30) * 60 * 1000;
        const now = Date.now();
        const earliestJoinTime = scheduledTime - 15 * 60 * 1000;
        const latestJoinTime = scheduledTime + durationMs + 60 * 60 * 1000;

        if (now < earliestJoinTime) {
          return NextResponse.json(
            { error: "Consultation room opens 15 minutes before the scheduled time." },
            { status: 403 }
          );
        }

        if (now > latestJoinTime) {
          return NextResponse.json(
            { error: "This consultation session window has ended." },
            { status: 403 }
          );
        }

        const remainingMs = latestJoinTime - now;
        tokenExpirySeconds = Math.max(1800, Math.min(7200, Math.floor(remainingMs / 1000)));
      }

      isAuthorized = true;
      // Astrologer has moderator privileges (mute, recording, start lobby)
      isModerator = isAstrologer;
    } else {
      // 2. Check if roomId corresponds to a leads enquiry record
      const { data: lead } = await adminClient
        .from("leads")
        .select("id, customer_id, astrologer_id, status")
        .eq("id", roomId)
        .maybeSingle();

      if (lead) {
        if (lead.status === "closed") {
          return NextResponse.json(
            { error: "This consultation enquiry has been closed." },
            { status: 403 }
          );
        }

        const isCustomer = lead.customer_id === user.id;
        let isAssignedAstrologer = false;

        if (astroProfile) {
          if (lead.astrologer_id === astroProfile.id) {
            isAssignedAstrologer = true;
          } else {
            const { data: assignment } = await adminClient
              .from("lead_assignments")
              .select("id")
              .eq("lead_id", lead.id)
              .eq("astrologer_id", astroProfile.id)
              .maybeSingle();

            if (assignment) {
              isAssignedAstrologer = true;
            }
          }
        }

        if (!isCustomer && !isAssignedAstrologer) {
          return NextResponse.json(
            { error: "You are not an authorized participant in this consultation enquiry" },
            { status: 403 }
          );
        }

        isAuthorized = true;
        isModerator = isAssignedAstrologer;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Consultation room not found or access denied" },
        { status: 404 }
      );
    }

    // Build participant info from the authenticated user
    const displayName =
      user.user_metadata?.display_name ||
      user.user_metadata?.full_name ||
      user.email?.split("@")[0] ||
      "Participant";

    const avatarUrl = user.user_metadata?.avatar_url || "";
    const email = user.email || "";
    const roomName = sanitiseRoomName(roomId);

    const token = await generateJaasToken({
      room: roomName,
      participant: {
        id: user.id,
        name: displayName,
        avatarUrl,
        email,
        isModerator,
      },
      expiresInSeconds: tokenExpirySeconds,
    });

    const roomUrl = buildJaasRoomUrl(appId, roomName, token);

    return NextResponse.json({
      token,
      roomUrl,
      appId,
      roomName,
    });
  } catch (err) {
    console.error("[consultation-token] Error generating JaaS token:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
