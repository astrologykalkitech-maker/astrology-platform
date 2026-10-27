/**
 * POST /api/consultation-token
 *
 * Generates a signed JaaS JWT for an authenticated consultation room.
 * Only accessible to logged-in customers OR astrologers who are parties to the room.
 *
 * Request body:
 *   { roomId: string; role: "customer" | "astrologer" }
 *
 * Response:
 *   { token: string; roomUrl: string; appId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  generateJaasToken,
  buildJaasRoomUrl,
  sanitiseRoomName,
} from "@/lib/jaas/generateJaasToken";

export const runtime = "nodejs"; // jose importPKCS8 requires Node.js crypto

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roomId, role } = body as { roomId?: string; role?: string };

    if (!roomId || typeof roomId !== "string") {
      return NextResponse.json({ error: "roomId is required" }, { status: 400 });
    }

    if (role !== "customer" && role !== "astrologer") {
      return NextResponse.json(
        { error: "role must be 'customer' or 'astrologer'" },
        { status: 400 }
      );
    }

    const appId = process.env.JAAS_APP_ID;
    if (!appId) {
      return NextResponse.json(
        { error: "JaaS not configured on server" },
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

    // Build participant info from the authenticated user
    // We use the user's metadata for display name and avatar
    const displayName =
      user.user_metadata?.display_name ||
      user.user_metadata?.full_name ||
      user.email?.split("@")[0] ||
      "Participant";

    const avatarUrl = user.user_metadata?.avatar_url || "";
    const email = user.email || "";

    // Astrologers are moderators (can mute, record, start lobby)
    const isModerator = role === "astrologer";

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
      // 2-hour token lifetime
      expiresInSeconds: 7200,
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
