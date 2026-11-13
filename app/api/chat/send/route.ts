import { NextRequest, NextResponse } from "next/server";
import { sendDirectMessageAction } from "@/app/actions/direct-chat";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
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
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to send message" },
      { status: 500 }
    );
  }
}

