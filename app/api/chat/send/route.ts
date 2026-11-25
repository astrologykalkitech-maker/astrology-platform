import { NextRequest, NextResponse } from "next/server";
import { sendDirectMessageAction } from "@/app/actions/direct-chat";
import { checkRateLimitAsync, extractClientIp } from "@/lib/security/rate-limit";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // 1. Identify caller and enforce rate limiting (60 messages/min to match Server Action)
    const user = await getCurrentUser();
    const rateLimitKey = user?.id
      ? `chat:send:user:${user.id}`
      : `chat:send:ip:${extractClientIp(req)}`;

    const rl = await checkRateLimitAsync(rateLimitKey, 60, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many messages sent. Please slow down." },
        { status: 429, headers: { "Retry-After": rl.retryAfterSeconds.toString() } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { conversationId, message, options } = body;

    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: "Missing conversationId" },
        { status: 400 }
      );
    }

    const res = await sendDirectMessageAction(conversationId, message, options);

    if (!res.success) {
      return NextResponse.json(res, { status: 400 });
    }

    return NextResponse.json(res);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to send message";
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}

