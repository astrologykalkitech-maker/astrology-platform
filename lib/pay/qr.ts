import QRCode from "qrcode";
import { getJyotishPayConfig } from "./config";
import { formatPaiseToInr } from "../financial/pricing";

export interface BuildUPIUriOptions {
  transactionReference: string;
  amountPaise: number;
  transactionNote: string;
  merchantVpa?: string;
  merchantName?: string;
  merchantCode?: string;
  isPersonalUPI?: boolean;
}

/**
 * Builds standard NPCI-compliant UPI Intent URI.
 * Works seamlessly with both:
 * 1. Merchant UPIs (PhonePe Business, Google Pay for Business, Paytm Business, Cashfree) - includes mc, tr, tn
 * 2. Personal UPIs (e.g. mobile@okaxis, user@ybl, name@icici) - cleans non-standard params so banking apps don't throw "Merchant format error"
 */
export function buildUPIUri(options: BuildUPIUriOptions): string {
  const config = getJyotishPayConfig();
  const vpa = (options.merchantVpa || config.merchantVpa).trim();
  const name = (options.merchantName || config.merchantName).trim();
  const inrAmount = (options.amountPaise / 100).toFixed(2);
  const isPersonal = options.isPersonalUPI ?? (config.merchantCode === "0000" || !config.merchantCode);

  const params = new URLSearchParams();
  params.set("pa", vpa);
  params.set("pn", name);

  // If merchant, pass Merchant Category Code (MCC)
  if (!isPersonal && config.merchantCode && config.merchantCode !== "0000") {
    params.set("mc", options.merchantCode || config.merchantCode);
  }

  // Transaction reference (sessionCode) used by aggregators & payment verification
  params.set("tr", options.transactionReference);
  // Transaction note displayed on payer's screen
  params.set("tn", options.transactionNote.slice(0, 50));
  // Exact amount in INR
  params.set("am", inrAmount);
  params.set("cu", "INR");

  return `upi://pay?${params.toString()}`;
}

/**
 * Generates an SVG string representation of the UPI QR code.
 */
export async function generateUPISvg(upiUri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    QRCode.toString(
      upiUri,
      {
        type: "svg",
        margin: 2,
        color: {
          dark: "#0F172A", // Deep midnight slate
          light: "#FFFFFF",
        },
        errorCorrectionLevel: "M",
      },
      (err, svg) => {
        if (err) return reject(err);
        resolve(svg);
      }
    );
  });
}

/**
 * Generates a data URL (base64 image/png) for mobile/web preview fallback.
 */
export async function generateUPIDataUrl(upiUri: string): Promise<string> {
  return QRCode.toDataURL(upiUri, {
    margin: 2,
    width: 320,
    color: {
      dark: "#0F172A",
      light: "#FFFFFF",
    },
    errorCorrectionLevel: "M",
  });
}

