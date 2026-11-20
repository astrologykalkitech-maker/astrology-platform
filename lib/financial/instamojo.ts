import https from "https";
import crypto from "crypto";

export interface InstamojoConfig {
  apiVersion: "v1.1" | "v2";
  environment: "sandbox" | "production";
  endpoint: string;
  apiKey?: string;
  authToken?: string;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  salt?: string;
  webhookSecret?: string;
  redirectUrl: string;
}

export interface CreatePaymentRequestParams {
  amount: number; // in Rupees
  purpose: string;
  buyerName: string;
  email: string;
  phone?: string;
  redirectUrl?: string;
  webhookUrl?: string;
  sendEmail?: boolean;
  sendSms?: boolean;
}

export interface PaymentRequestResult {
  id: string;
  longurl: string;
  shorturl?: string;
  amount: string;
  purpose: string;
  status: string;
}

/**
 * Resolves current Instamojo configuration safely.
 */
export function getInstamojoConfig(): InstamojoConfig {
  const envSetting = (process.env.INSTAMOJO_ENV || process.env.INSTAMOJO_ENVIRONMENT || "").toLowerCase();
  const isProduction = envSetting === "production";
  const explicitVersion = (process.env.INSTAMOJO_API_VERSION || "v1.1").toLowerCase() === "v2" ? "v2" : "v1.1";

  const defaultEndpoint = isProduction
    ? (explicitVersion === "v2" ? "https://api.instamojo.com/v2/" : "https://www.instamojo.com/api/1.1/")
    : (explicitVersion === "v2" ? "https://test.instamojo.com/v2/" : "https://test.instamojo.com/api/1.1/");

  const configuredEndpoint = process.env.INSTAMOJO_API_BASE_URL || defaultEndpoint;
  const endpoint = configuredEndpoint.endsWith("/") ? configuredEndpoint : `${configuredEndpoint}/`;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  return {
    apiVersion: explicitVersion,
    environment: isProduction ? "production" : "sandbox",
    endpoint,
    apiKey: process.env.INSTAMOJO_API_KEY,
    authToken: process.env.INSTAMOJO_AUTH_TOKEN,
    clientId: process.env.INSTAMOJO_CLIENT_ID,
    clientSecret: process.env.INSTAMOJO_CLIENT_SECRET,
    accessToken: process.env.INSTAMOJO_ACCESS_TOKEN,
    salt: process.env.INSTAMOJO_SALT || process.env.INSTAMOJO_WEBHOOK_SECRET,
    webhookSecret: process.env.INSTAMOJO_WEBHOOK_SECRET || process.env.INSTAMOJO_SALT,
    redirectUrl: process.env.INSTAMOJO_REDIRECT_URL || `${siteUrl}/api/payments/instamojo/callback`,
  };
}

/**
 * Obtains an OAuth2 Access Token for v2 Application Authentication.
 */
export async function getOAuth2AccessToken(clientId: string, clientSecret: string, isProduction: boolean): Promise<string> {
  const tokenHost = isProduction ? "api.instamojo.com" : "test.instamojo.com";
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: tokenHost,
        port: 443,
        path: "/oauth2/token/",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 10000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode === 200 && parsed.access_token) {
              resolve(parsed.access_token);
            } else {
              reject(new Error(parsed.error_description || parsed.error || `HTTP ${res.statusCode} obtaining OAuth token`));
            }
          } catch {
            reject(new Error(`Invalid JSON from OAuth2 endpoint: ${data}`));
          }
        });
      }
    );

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout connecting to Instamojo OAuth endpoint"));
    });

    req.write(body);
    req.end();
  });
}

/**
 * Creates an authorized payment request on Instamojo.
 */
export async function createInstamojoPaymentRequest(
  params: CreatePaymentRequestParams
): Promise<{ success: boolean; data?: PaymentRequestResult; error?: string; statusCode?: number }> {
  const config = getInstamojoConfig();

  if (!params.amount || params.amount <= 0) {
    return { success: false, error: "Invalid payment amount" };
  }
  if (!params.purpose || !params.buyerName || !params.email) {
    return { success: false, error: "Missing required buyer name, email, or purpose" };
  }

  const cleanPhone = params.phone ? params.phone.replace(/[^0-9]/g, "").slice(-10) : "";
  const postParams = new URLSearchParams();
  postParams.append("amount", params.amount.toFixed(2));
  postParams.append("purpose", params.purpose.slice(0, 30));
  postParams.append("buyer_name", params.buyerName.slice(0, 100));
  postParams.append("email", params.email);
  if (cleanPhone.length >= 10) {
    postParams.append("phone", cleanPhone);
  }
  postParams.append("redirect_url", params.redirectUrl || config.redirectUrl);
  if (params.webhookUrl) {
    postParams.append("webhook", params.webhookUrl);
  }
  postParams.append("send_email", params.sendEmail ? "True" : "False");
  postParams.append("send_sms", params.sendSms ? "True" : "False");
  postParams.append("allow_repeated_payments", "False");

  const postBody = postParams.toString();
  const targetUrl = new URL(config.endpoint.endsWith("payment-requests/") || config.endpoint.endsWith("payment_requests/") ? config.endpoint : `${config.endpoint}payment-requests/`);

  let authHeaders: Record<string, string> = {};

  if (config.apiVersion === "v2") {
    let token = config.accessToken;
    if (!token && config.clientId && config.clientSecret) {
      try {
        token = await getOAuth2AccessToken(config.clientId, config.clientSecret, config.environment === "production");
      } catch (tokenErr) {
        return {
          success: false,
          error: `OAuth2 token failure: ${tokenErr instanceof Error ? tokenErr.message : "Authentication error"}`,
        };
      }
    }
    if (!token) {
      return { success: false, error: "v2 API requires INSTAMOJO_ACCESS_TOKEN or CLIENT_ID & CLIENT_SECRET" };
    }
    authHeaders = { Authorization: `Bearer ${token}` };
  } else {
    // v1.1
    if (!config.apiKey || !config.authToken) {
      return { success: false, error: "v1.1 API requires INSTAMOJO_API_KEY and INSTAMOJO_AUTH_TOKEN" };
    }
    authHeaders = {
      "X-Api-Key": config.apiKey,
      "X-Auth-Token": config.authToken,
    };
  }

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: targetUrl.hostname,
        port: 443,
        path: targetUrl.pathname,
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(postBody),
        },
        timeout: 10000,
      },
      (res) => {
        let resData = "";
        res.on("data", (c) => (resData += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(resData);
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300 && json.success) {
              const pr = json.payment_request;
              resolve({
                success: true,
                statusCode: res.statusCode,
                data: {
                  id: pr.id,
                  longurl: pr.longurl,
                  shorturl: pr.shorturl,
                  amount: pr.amount,
                  purpose: pr.purpose,
                  status: pr.status,
                },
              });
            } else {
              const errMsg = typeof json.message === "object" ? JSON.stringify(json.message) : (json.message || `HTTP ${res.statusCode}`);
              resolve({
                success: false,
                statusCode: res.statusCode,
                error: errMsg,
              });
            }
          } catch {
            resolve({
              success: false,
              statusCode: res.statusCode,
              error: `Invalid response from payment gateway (${res.statusCode})`,
            });
          }
        });
      }
    );

    req.on("error", (err) => {
      resolve({ success: false, error: err.message });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ success: false, error: "Instamojo gateway request timed out (10s)" });
    });

    req.write(postBody);
    req.end();
  });
}

/**
 * Fetches status of a payment request from Instamojo.
 */
export async function getInstamojoPaymentDetails(
  paymentRequestId: string,
  paymentId?: string
): Promise<{ success: boolean; data?: { id: string; status: string; payments: Array<{ payment_id: string; status: string; amount: string; fees: string; buyer_name: string; buyer_email: string; buyer_phone: string }> }; error?: string }> {
  const config = getInstamojoConfig();
  const targetHost = config.environment === "production" ? "www.instamojo.com" : "test.instamojo.com";
  let targetPath = `/api/1.1/payment-requests/${paymentRequestId}/`;
  if (paymentId) {
    targetPath += `${paymentId}/`;
  }

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: targetHost,
        port: 443,
        path: targetPath,
        method: "GET",
        headers: {
          "X-Api-Key": config.apiKey || "",
          "X-Auth-Token": config.authToken || "",
        },
        timeout: 10000,
      },
      (res) => {
        let resData = "";
        res.on("data", (c) => (resData += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(resData);
            if (res.statusCode === 200 && json.success) {
              resolve({ success: true, data: json.payment_request });
            } else {
              resolve({ success: false, error: json.message || `HTTP ${res.statusCode}` });
            }
          } catch {
            resolve({ success: false, error: "Failed to parse payment details from Instamojo" });
          }
        });
      }
    );

    req.on("error", (err) => resolve({ success: false, error: err.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ success: false, error: "Timeout fetching payment details from Instamojo" });
    });

    req.end();
  });
}

/**
 * Computes and validates the HMAC-SHA1 signature of a Webhook payload.
 */
export function verifyInstamojoMac(
  payload: Record<string, string | number | undefined | null>,
  macToVerify: string,
  salt?: string
): boolean {
  const secret = salt || getInstamojoConfig().salt;
  if (!secret) return false;

  const keys = Object.keys(payload)
    .filter((k) => k.toLowerCase() !== "mac")
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const dataParts: string[] = [];
  for (const k of keys) {
    const val = payload[k];
    dataParts.push(val !== undefined && val !== null ? String(val) : "");
  }

  const message = dataParts.join("|");
  const computedMac = crypto.createHmac("sha1", secret).update(message).digest("hex");

  const computedBuf = Buffer.from(computedMac.toLowerCase(), "utf8");
  const verifyBuf = Buffer.from(macToVerify.toLowerCase(), "utf8");

  if (computedBuf.length !== verifyBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedBuf, verifyBuf);
}

export function verifyRequiredInstamojoMac(
  payload: Record<string, string | number | undefined | null>,
  macToVerify: unknown,
  salt?: string
): boolean {
  return (
    typeof macToVerify === "string" &&
    macToVerify.trim().length > 0 &&
    verifyInstamojoMac(payload, macToVerify, salt)
  );
}

/**
 * Initiates an authorized refund via Instamojo API.
 */
export async function createInstamojoRefund(params: {
  paymentId: string;
  type: "RFD" | "TNR" | "QFL" | "QNR" | "EWN" | "OTH";
  body: string;
  refundAmount?: number;
}): Promise<{ success: boolean; data?: { id: string }; error?: string }> {
  const config = getInstamojoConfig();
  const targetHost = config.environment === "production" ? "www.instamojo.com" : "test.instamojo.com";
  const postParams = new URLSearchParams({
    payment_id: params.paymentId,
    type: params.type,
    body: params.body.slice(0, 250),
  });
  if (params.refundAmount !== undefined && params.refundAmount > 0) {
    postParams.append("refund_amount", params.refundAmount.toFixed(2));
  }
  const postBody = postParams.toString();

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: targetHost,
        port: 443,
        path: "/api/1.1/refunds/",
        method: "POST",
        headers: {
          "X-Api-Key": config.apiKey || "",
          "X-Auth-Token": config.authToken || "",
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(postBody),
        },
        timeout: 10000,
      },
      (res) => {
        let resData = "";
        res.on("data", (c) => (resData += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(resData);
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300 && json.success) {
              resolve({ success: true, data: json.refund });
            } else {
              resolve({ success: false, error: json.message || `HTTP ${res.statusCode}` });
            }
          } catch {
            resolve({ success: false, error: "Failed to parse refund response" });
          }
        });
      }
    );

    req.on("error", (err) => resolve({ success: false, error: err.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ success: false, error: "Timeout contacting refund API" });
    });

    req.write(postBody);
    req.end();
  });
}
