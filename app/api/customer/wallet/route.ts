import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCustomerWallet } from "@/lib/financial/wallet-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const wallet = await getCustomerWallet(user.id);
    if (!wallet) {
      return NextResponse.json({
        success: true,
        data: {
          paid_balance_paise: 0,
          promotional_balance_paise: 0,
          refund_balance_paise: 0,
          reserved_balance_paise: 0,
          total_available_paise: 0,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: wallet,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to fetch wallet" },
      { status: 500 }
    );
  }
}
