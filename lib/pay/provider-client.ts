/**
 * JyotishSetu Pay External Provider Client
 *
 * Provides server-to-server authenticated transaction verification and automated
 * refund calls when an external UPI aggregator API (`JYOTISH_PAY_PROVIDER_STATUS_URL`
 * and `JYOTISH_PAY_PROVIDER_REFUND_URL`) is configured.
 */

export interface ProviderVerificationResult {
  configured: boolean;
  verified: boolean;
  providerStatus?: string;
  amountPaise?: number;
  utr?: string;
  error?: string;
}

export interface ProviderRefundResult {
  configured: boolean;
  success: boolean;
  refundId?: string;
  error?: string;
}

export async function verifyJyotishProviderTransaction(params: {
  sessionCode: string;
  utr: string;
  expectedAmountPaise: number;
}): Promise<ProviderVerificationResult> {
  const statusUrl = (process.env.JYOTISH_PAY_PROVIDER_STATUS_URL || "").trim();
  const apiKey = (process.env.JYOTISH_PAY_PROVIDER_API_KEY || "").trim();

  if (!statusUrl) {
    return { configured: false, verified: false };
  }

  try {
    const res = await fetch(statusUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        session_code: params.sessionCode,
        utr: params.utr,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        configured: true,
        verified: false,
        error: data?.error || `Provider lookup failed with HTTP ${res.status}`,
      };
    }

    const providerStatus = String(data?.status || "").toUpperCase();
    const providerAmountPaise = Number(data?.amount_paise ?? (data?.amount ? Math.round(Number(data.amount) * 100) : 0));
    const isPaid = providerStatus === "SUCCESS" || providerStatus === "COMPLETED" || providerStatus === "CAPTURED";

    if (!isPaid) {
      return {
        configured: true,
        verified: false,
        providerStatus,
        error: `Provider returned non-success status: ${providerStatus || "UNKNOWN"}`,
      };
    }

    if (providerAmountPaise > 0 && providerAmountPaise !== params.expectedAmountPaise) {
      return {
        configured: true,
        verified: false,
        providerStatus,
        amountPaise: providerAmountPaise,
        error: `Amount mismatch: expected ${params.expectedAmountPaise} paise, provider reported ${providerAmountPaise} paise.`,
      };
    }

    return {
      configured: true,
      verified: true,
      providerStatus,
      amountPaise: providerAmountPaise || params.expectedAmountPaise,
      utr: String(data?.utr || params.utr),
    };
  } catch (err) {
    return {
      configured: true,
      verified: false,
      error: err instanceof Error ? err.message : "Provider verification network error",
    };
  }
}

export async function refundJyotishProviderTransaction(params: {
  utr: string;
  amountPaise: number;
  reason: string;
  refundRequestId: string;
}): Promise<ProviderRefundResult> {
  const refundUrl = (process.env.JYOTISH_PAY_PROVIDER_REFUND_URL || "").trim();
  const apiKey = (process.env.JYOTISH_PAY_PROVIDER_API_KEY || "").trim();

  if (!refundUrl) {
    return { configured: false, success: false };
  }

  try {
    const res = await fetch(refundUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        utr: params.utr,
        amount_paise: params.amountPaise,
        reason: params.reason,
        refund_request_id: params.refundRequestId,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return {
        configured: true,
        success: false,
        error: data?.error || `Provider refund failed with HTTP ${res.status}`,
      };
    }

    return {
      configured: true,
      success: true,
      refundId: String(data?.refund_id || data?.id || `JSP_RFD_${params.refundRequestId.slice(0, 8)}`),
    };
  } catch (err) {
    return {
      configured: true,
      success: false,
      error: err instanceof Error ? err.message : "Provider refund network error",
    };
  }
}
