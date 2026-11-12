"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  X, 
  ShieldCheck, 
  Copy, 
  Check, 
  ExternalLink, 
  RefreshCw, 
  AlertCircle,
  FileText,
  Clock,
  Smartphone,
  RotateCcw,
  MonitorSmartphone,
  ChevronRight,
  Info
} from "lucide-react";
import { formatPaiseToInr } from "@/lib/financial/pricing";

interface JyotishPayModalProps {
  isOpen: boolean;
  onClose: () => void;
  amountPaise: number;
  entityType: "consultation" | "subscription";
  title: string;
  description: string;
  bookingId?: string;
  planId?: string;
  astrologerId?: string;
  customerId?: string;
  onSuccess: (receiptNumber: string) => void;
}

export function JyotishPayModal({
  isOpen,
  onClose,
  amountPaise,
  entityType,
  title,
  description,
  bookingId,
  planId,
  astrologerId,
  customerId,
  onSuccess,
}: JyotishPayModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedVpa, setCopiedVpa] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  
  // App launch handoff states
  const [appLaunchStatus, setAppLaunchStatus] = useState<"idle" | "launching" | "unsupported">("idle");
  const [launchMessage, setLaunchMessage] = useState<string | null>(null);

  // Manual UTR submission - default to visible so user never has to search for it
  const [showManualUtrInput, setShowManualUtrInput] = useState(true);
  const [manualUtr, setManualUtr] = useState("");
  const [submittingUtr, setSubmittingUtr] = useState(false);

  // Intent & QR Session details
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [upiUri, setUpiUri] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [merchantVpa, setMerchantVpa] = useState<string>("jyotishsetu@upi");
  const [status, setStatus] = useState<"initiating" | "active" | "completed" | "expired">("initiating");
  const [secondsRemaining, setSecondsRemaining] = useState(600);
  const [simulating, setSimulating] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const fallbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Detect mobile vs desktop
  useEffect(() => {
    if (typeof window !== "undefined") {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      const isMobile = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
      setIsMobileDevice(isMobile);
    }
  }, []);

  // Lock background scroll when modal is active
  useEffect(() => {
    if (isOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  // Initialize payment intent and dynamic QR
  const initializeIntent = async () => {
    setLoading(true);
    setError(null);
    setAppLaunchStatus("idle");
    setLaunchMessage(null);
    try {
      const res = await fetch("/api/pay/intent/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_paise: amountPaise,
          entity_type: entityType,
          booking_id: bookingId,
          plan_id: planId,
          astrologer_id: astrologerId,
          customer_id: customerId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to initialize JyotishSetu Pay");
      }

      setSessionCode(data.qrSession.sessionCode);
      setUpiUri(data.qrSession.upiUri);
      setQrSvg(data.qrSession.qrSvg);
      if (data.qrSession.merchantVpa) {
        setMerchantVpa(data.qrSession.merchantVpa);
      }
      setStatus("active");
      setSecondsRemaining(600); // 10 minutes
    } catch (err: any) {
      setError(err.message || "Failed to start payment session");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setSessionCode(null);
      setUpiUri(null);
      setQrSvg(null);
      setStatus("initiating");
      setError(null);
      setReceiptNumber(null);
      setShowManualUtrInput(true);
      setManualUtr("");
      setAppLaunchStatus("idle");
      setLaunchMessage(null);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      return;
    }

    initializeIntent();

    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, [isOpen, amountPaise, entityType, bookingId, planId, astrologerId, customerId]);

  // Polling for QR Payment Status
  const isPollingRef = useRef(false);
  const checkPaymentStatus = async (isManual = false) => {
    if (!sessionCode || isPollingRef.current) return;
    isPollingRef.current = true;
    if (isManual) setCheckingStatus(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`/api/pay/qr/${sessionCode}/status`, {
        signal: controller.signal,
        headers: { "Cache-Control": "no-cache" }
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (data.success && (data.status === "completed" || data.intentStatus === "succeeded")) {
        const finalReceipt = data.receiptNumber || `JSP-REC-${sessionCode.slice(-6)}`;
        setStatus("completed");
        setReceiptNumber(finalReceipt);
        onSuccess(finalReceipt);
      } else if (data.status === "expired") {
        setStatus("expired");
      }
    } catch (e) {
      // silent
    } finally {
      isPollingRef.current = false;
      if (isManual) setCheckingStatus(false);
    }
  };

  useEffect(() => {
    if (!sessionCode || status !== "active") return;
    const interval = setInterval(() => {
      checkPaymentStatus(false);
    }, 4000);

    return () => clearInterval(interval);
  }, [sessionCode, status]);

  // Countdown timer
  useEffect(() => {
    if (status !== "active") return;
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setStatus("expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status]);

  /**
   * Universal UPI App Launch (Desktop & Mobile)
   * Attempts standard protocol handoff (upi://pay?...) while listening for window blur.
   * If on desktop and no protocol handler accepts the link, graceful fallback alert appears.
   */
  const handlePayViaUpiApp = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!upiUri) return;

    setError(null);
    setAppLaunchStatus("launching");
    setLaunchMessage("Opening supported UPI payment application...");

    let didBlur = false;
    const onBlur = () => {
      didBlur = true;
      setLaunchMessage("UPI application launched. Complete payment in your app; this window will update automatically.");
    };

    window.addEventListener("blur", onBlur, { once: true });

    // Attempt protocol handoff
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    document.body.appendChild(iframe);

    try {
      window.location.assign(upiUri);
    } catch (err) {
      // fallback
    }

    // Evaluate handoff after 2.2 seconds
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current = setTimeout(() => {
      window.removeEventListener("blur", onBlur);
      try {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
      } catch (e) {}

      if (!didBlur && !isMobileDevice) {
        setAppLaunchStatus("unsupported");
        setLaunchMessage("No compatible UPI payment application was detected on this computer. Scan the QR code using your mobile UPI app to complete payment.");
      } else if (!didBlur && isMobileDevice) {
        setAppLaunchStatus("unsupported");
        setLaunchMessage("Unable to trigger default UPI app. Please scan the QR code or copy the UPI ID below.");
      }
    }, 2200);
  };

  const handleSimulatePayment = async () => {
    if (!sessionCode) return;
    setSimulating(true);
    try {
      const res = await fetch("/api/pay/simulate/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_code: sessionCode,
          utr: `BANK${Date.now().toString().slice(-8)}`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus("completed");
        setReceiptNumber(data.receiptNumber);
        onSuccess(data.receiptNumber);
      } else {
        setError(data.error || "Simulation failed");
      }
    } catch (e: any) {
      setError(e.message || "Simulation failed");
    } finally {
      setSimulating(false);
    }
  };

  const handleSubmitManualUtr = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUtr = manualUtr.trim();
    if (!cleanUtr) {
      setError("Please enter the 12-digit Bank UTR / Reference ID.");
      return;
    }
    if (cleanUtr.length !== 12 || !/^[A-Za-z0-9]{12}$/.test(cleanUtr)) {
      setError("Invalid UTR: Bank UTR must be exactly 12 alphanumeric characters.");
      return;
    }
    if (!sessionCode) return;

    setSubmittingUtr(true);
    setError(null);
    try {
      const res = await fetch("/api/pay/verify-utr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_code: sessionCode,
          utr: cleanUtr,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus("completed");
        setReceiptNumber(data.receiptNumber);
        onSuccess(data.receiptNumber);
      } else {
        setError(data.error || "Failed to verify UTR reference.");
      }
    } catch (e: any) {
      setError(e.message || "UTR confirmation error");
    } finally {
      setSubmittingUtr(false);
    }
  };

  const copyVpa = () => {
    navigator.clipboard.writeText(merchantVpa);
    setCopiedVpa(true);
    setTimeout(() => setCopiedVpa(false), 2000);
  };

  const copyRef = () => {
    if (!sessionCode) return;
    navigator.clipboard.writeText(sessionCode);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  if (!isOpen) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-950/85 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-xl max-h-[92dvh] flex flex-col bg-slate-900 border border-amber-500/35 rounded-2xl shadow-2xl shadow-amber-500/10 overflow-hidden text-slate-100 my-auto">
        
        {/* Sticky Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/90 z-10">
          <div className="flex items-center space-x-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="font-semibold text-base sm:text-lg text-amber-200 tracking-wide">
              JyotishSetu Pay
            </h3>
            <span className="text-[10px] bg-amber-500/20 text-amber-300 font-mono px-2 py-0.5 rounded-full border border-amber-500/30">
              UPI DIRECT
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* Order Summary Compact Box */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 sm:p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium truncate">{title}</p>
              <p className="text-xs sm:text-sm text-slate-200 truncate">{description}</p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Total Payable</span>
              <p className="text-lg sm:text-xl font-bold text-emerald-400">{formatPaiseToInr(amountPaise)}</p>
            </div>
          </div>

          {/* Error Notice */}
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-xl flex items-start space-x-2.5 text-red-200 text-xs">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* App Handoff Status Message */}
          {launchMessage && (
            <div className={`p-3 rounded-xl flex items-start space-x-2.5 text-xs border ${
              appLaunchStatus === "unsupported" 
                ? "bg-amber-950/40 border-amber-500/40 text-amber-200" 
                : "bg-blue-950/40 border-blue-500/40 text-blue-200"
            }`}>
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span>{launchMessage}</span>
                {appLaunchStatus === "unsupported" && (
                  <button
                    onClick={handlePayViaUpiApp}
                    className="block mt-1 font-semibold underline text-amber-300 hover:text-amber-100"
                  >
                    Try launching app again
                  </button>
                )}
              </div>
            </div>
          )}

          {/* State 1: Initiating / Loading */}
          {loading && (
            <div className="py-10 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="h-8 w-8 text-amber-400 animate-spin" />
              <p className="text-xs sm:text-sm text-slate-300">Generating secure dynamic UPI QR session...</p>
            </div>
          )}

          {/* State 2: Active QR & Payment Actions */}
          {!loading && status === "active" && qrSvg && (
            <div className="flex flex-col items-center space-y-4">
              
              {/* Dynamic QR Code Box - Sized responsively to never clip */}
              <div className="flex flex-col items-center">
                <div className="p-2 sm:p-2.5 bg-white rounded-xl shadow-xl border-2 border-amber-500/40">
                  <div 
                    className="w-40 h-40 sm:w-48 sm:h-48 md:w-52 md:h-52 flex items-center justify-center"
                    dangerouslySetInnerHTML={{ __html: qrSvg }}
                  />
                </div>

                {/* Expiry Countdown & Recipient */}
                <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2 text-[11px]">
                  <div className="flex items-center space-x-1.5 text-amber-300 bg-amber-950/50 px-2.5 py-1 rounded-full border border-amber-500/30">
                    <Clock className="h-3.5 w-3.5 text-amber-400" />
                    <span>Expires in: <strong className="font-mono text-amber-200">{minutes}:{seconds < 10 ? `0${seconds}` : seconds}</strong></span>
                  </div>
                  <span className="text-slate-400">Payee: <strong className="text-slate-200">JyotishSetu</strong></span>
                </div>
              </div>

              {/* Primary Payment Action: Pay via UPI App (Desktop & Mobile) */}
              <div className="w-full space-y-2 pt-1">
                <button
                  onClick={handlePayViaUpiApp}
                  className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-slate-950 font-bold text-sm rounded-xl flex items-center justify-center space-x-2 shadow-lg transition-all"
                >
                  <MonitorSmartphone className="h-4 w-4" />
                  <span>Pay via UPI App</span>
                  <ExternalLink className="h-3.5 w-3.5 opacity-80" />
                </button>

                {/* Action Secondary Grid: Copy UPI ID, Copy Ref, Refresh */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={copyVpa}
                    className="py-2 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center justify-center space-x-1 border border-slate-700 transition-colors"
                  >
                    {copiedVpa ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span className="truncate">{copiedVpa ? "Copied" : "Copy UPI"}</span>
                  </button>

                  <button
                    onClick={copyRef}
                    className="py-2 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center justify-center space-x-1 border border-slate-700 transition-colors"
                  >
                    {copiedRef ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span className="truncate">{copiedRef ? "Copied" : "Copy Ref"}</span>
                  </button>

                  <button
                    onClick={() => checkPaymentStatus(true)}
                    disabled={checkingStatus}
                    className="py-2 px-2 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-medium rounded-lg flex items-center justify-center space-x-1 border border-slate-700 transition-colors disabled:opacity-60"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${checkingStatus ? "animate-spin" : ""}`} />
                    <span className="truncate">Refresh</span>
                  </button>
                </div>
              </div>

              {/* Bank UTR / Reference ID Submission */}
              <div className="w-full pt-1">
                <form onSubmit={handleSubmitManualUtr} className="w-full p-3 bg-slate-800/90 border border-amber-500/30 rounded-xl space-y-2 shadow-inner">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-slate-200 block">
                      Paid via UPI? Enter 12-Digit Bank UTR / Ref ID:
                    </label>
                    <span className="text-[10px] text-amber-300 font-mono">
                      {manualUtr.length}/12
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      minLength={12}
                      maxLength={12}
                      placeholder="e.g. 431289123456"
                      value={manualUtr}
                      onChange={(e) => setManualUtr(e.target.value.replace(/[^A-Za-z0-9]/g, ""))}
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-mono tracking-wider"
                    />
                    <button
                      type="submit"
                      disabled={submittingUtr || manualUtr.trim().length !== 12}
                      className="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold text-xs rounded-lg disabled:opacity-40 transition-all shadow-md flex items-center gap-1.5"
                    >
                      {submittingUtr ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Verify"}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Find the 12-digit UPI Ref / UTR number in your PhonePe / GPay / Paytm payment details.
                  </p>
                </form>
              </div>

              {/* Dev Mode Simulation Button (Only shown in non-production) */}
              {process.env.NODE_ENV !== "production" && (
                <div className="w-full pt-1 border-t border-slate-800">
                  <button
                    onClick={handleSimulatePayment}
                    disabled={simulating}
                    className="w-full py-1.5 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/40 text-emerald-300 text-[11px] font-medium rounded-lg flex items-center justify-center space-x-1.5 transition-colors disabled:opacity-50"
                  >
                    {simulating ? <RefreshCw className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />}
                    <span>[Dev Mode] Simulate Instant Banking Credit & Confirm</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* State 3: Payment Completed */}
          {status === "completed" && (
            <div className="py-8 flex flex-col items-center text-center space-y-4 animate-fade-in">
              <div className="h-16 w-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center border-2 border-emerald-500/40 shadow-lg shadow-emerald-500/20">
                <Check className="h-8 w-8 stroke-[3]" />
              </div>

              <div className="space-y-1.5">
                <h4 className="text-xl font-bold text-slate-100">Payment Successful!</h4>
                <p className="text-sm font-medium text-emerald-400">
                  Your Professional subscription has been activated successfully.
                </p>
                <p className="text-xs text-slate-300">
                  Your account is now upgraded. Enjoy your Professional membership.
                </p>
                {receiptNumber && (
                  <p className="text-xs font-mono text-amber-300 mt-2 bg-slate-950 px-3 py-1.5 rounded-md inline-block border border-slate-800">
                    Receipt: {receiptNumber}
                  </p>
                )}
                <p className="text-[11px] text-slate-400 italic pt-1">
                  Updating your dashboard and closing in 3 seconds...
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <a
                  href={`/api/pay/receipt/download?session_code=${sessionCode}&receipt_number=${receiptNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2 px-3.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-semibold rounded-xl flex items-center space-x-2 transition-colors"
                >
                  <FileText className="h-4 w-4 text-amber-400" />
                  <span>Download Invoice</span>
                </a>

                <button
                  onClick={onClose}
                  className="py-2 px-5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-lg transition-colors"
                >
                  Close Now
                </button>
              </div>
            </div>
          )}

          {/* State 4: Expired */}
          {status === "expired" && (
            <div className="py-6 flex flex-col items-center text-center space-y-3">
              <AlertCircle className="h-10 w-10 text-amber-500" />
              <h4 className="text-base font-bold text-slate-200">Session Expired</h4>
              <p className="text-xs text-slate-400 max-w-xs">
                This dynamic QR session has timed out. Click below to regenerate a new secure session.
              </p>
              <button
                onClick={initializeIntent}
                className="py-2 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg flex items-center space-x-1.5 shadow"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Regenerate Payment Session</span>
              </button>
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="shrink-0 px-4 py-2.5 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 z-10">
          <div className="flex items-center space-x-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>256-Bit Encrypted Pipeline</span>
          </div>
          <span>NPCI UPI Verified</span>
        </div>

      </div>
    </div>
  );
}
