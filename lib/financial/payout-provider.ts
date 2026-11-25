export type AutomatedPayoutRail = "IMPS" | "NEFT" | "UPI";

export interface AutomatedPayoutRequest {
  payoutId: string;
  payoutNumber: string;
  amountPaise: number;
  rail: AutomatedPayoutRail;
  beneficiaryName: string;
  accountNumber?: string | null;
  ifscCode?: string | null;
  upiVpa?: string | null;
}

export interface AutomatedPayoutResponse {
  configured: boolean;
  success: boolean;
  utrNumber?: string;
  providerReference?: string;
  error?: string;
}

/**
 * Executes an automated IMPS / NEFT / UPI bank transfer via the configured
 * payout aggregator API (`PAYOUT_PROVIDER_TRANSFER_URL` + `PAYOUT_PROVIDER_API_KEY`).
 */
export async function executeAutomatedBankPayout(
  req: AutomatedPayoutRequest
): Promise<AutomatedPayoutResponse> {
  const transferUrl = (process.env.PAYOUT_PROVIDER_TRANSFER_URL || "").trim();
  const apiKey = (process.env.PAYOUT_PROVIDER_API_KEY || "").trim();

  if (!transferUrl) {
    return {
      configured: false,
      success: false,
      error:
        "Automated payout provider is not configured (set PAYOUT_PROVIDER_TRANSFER_URL and PAYOUT_PROVIDER_API_KEY), or record a manual bank UTR instead.",
    };
  }

  try {
    const res = await fetch(transferUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        "X-Idempotency-Key": req.payoutId,
      },
      body: JSON.stringify({
        payout_id: req.payoutId,
        payout_number: req.payoutNumber,
        amount_paise: req.amountPaise,
        currency: "INR",
        transfer_mode: req.rail,
        beneficiary: {
          name: req.beneficiaryName,
          account_number: req.accountNumber || undefined,
          ifsc: req.ifscCode || undefined,
          vpa: req.upiVpa || undefined,
        },
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return {
        configured: true,
        success: false,
        error: data?.error || `Payout provider failed with HTTP ${res.status}`,
      };
    }

    const utr = String(data?.utr || data?.utr_number || data?.bank_reference || "").trim();
    const providerRef = String(data?.transfer_id || data?.provider_reference || utr).trim();

    if (!utr) {
      return {
        configured: true,
        success: false,
        error: "Payout provider returned success without a bank UTR reference.",
      };
    }

    return {
      configured: true,
      success: true,
      utrNumber: utr,
      providerReference: providerRef || utr,
    };
  } catch (err) {
    return {
      configured: true,
      success: false,
      error: err instanceof Error ? err.message : "Payout provider network error",
    };
  }
}
