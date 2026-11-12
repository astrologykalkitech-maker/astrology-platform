import QRCode from "qrcode";
import { getJyotishPayConfig } from "./config";
import { formatPaiseToInr } from "../financial/pricing";

export interface BuildUPIUriOptions {
  transactionReference: string;
  amountPaise: number;
  transactionNote: string;
  merchantVpa?: string;
  merchantName?: string;
}

/**
 * Builds standard NPCI-compliant UPI Intent URI.
 * Format: upi://pay?pa=...&pn=...&mc=...&tr=...&tn=...&am=...&cu=INR
 */
export function buildUPIUri(options: BuildUPIUriOptions): string {
  const config = getJyotishPayConfig();
  const vpa = options.merchantVpa || config.merchantVpa;
  const name = options.merchantName || config.merchantName;
  const inrAmount = (options.amountPaise / 100).toFixed(2);

  const params = new URLSearchParams({
    pa: vpa,
    pn: name,
    mc: config.merchantCode,
    tr: options.transactionReference,
    tn: options.transactionNote.slice(0, 50),
    am: inrAmount,
    cu: "INR",
  });

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
