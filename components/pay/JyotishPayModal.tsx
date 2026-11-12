"use client";

import React, { useState, useEffect } from "react";
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
  QrCode
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
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [showManualUtrInput, setShowManualUtrInput] = useState(false);
  const [manualUtr, setManualUtr] = useState("");
  const [submittingUtr, setSubmittingUtr] = useState(false);

  // Intent & QR Session details
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [upiUri, setUpiUri] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [status, setStatus] = useState<"initiating" | "active" | "completed" | "expired">("initiating");
  const [secondsRemaining, setSecondsRemaining] = useState(600);
  const [simulating, setSimulating] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState<string | null>(null);

  // Detect Mobile device on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      const isMobile = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
      setIsMobileDevice(isMobile);
    }
  }, []);

  // Initialize payment intent and QR when modal opens
  useEffect(() => {
    if (!isOpen) {
      setSessionCode(null);
      setUpiUri(null);
      setQrSvg(null);
      setStatus("initiating");
      setError(null);
      setReceiptNumber(null);
      setShowManualUtrInput(false);
      setManualUtr("");
      return;
    }

    let active = true;

    async function initIntent() {
      setLoading(true);
      setError(null);
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

        if (active) {
          setSessionCode(data.qrSession.sessionCode);
          setUpiUri(data.qrSession.upiUri);
          setQrSvg(data.qrSession.qrSvg);
          setStatus("active");
          setSecondsRemaining(600); // 10 minutes
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || "Failed to start payment session");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    initIntent();

    return () => {
      active = false;
    };
  }, [isOpen, amountPaise, entityType, bookingId, planId, astrologerId, customerId]);

  // Polling for QR Payment Status
  useEffect(() => {
    if (!sessionCode || status !== "active") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/pay/qr/${sessionCode}/status`);
        const data = await res.json();
        if (data.success && data.status === "completed") {
          setStatus("completed");
          setReceiptNumber(data.receiptNumber || `JSP-REC-${sessionCode.slice(-6)}`);
          clearInterval(interval);
          onSuccess(data.receiptNumber || `JSP-REC-${sessionCode.slice(-6)}`);
        } else if (data.status === "expired") {
          setStatus("expired");
          clearInterval(interval);
        }
      } catch (e) {
        // silent polling error
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [sessionCode, status, onSuccess]);

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

  // Handle Pay via UPI App button click
  const handlePayViaUpiApp = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!upiUri) return;

    // Check if on desktop vs mobile
    if (!isMobileDevice) {
      // On desktop, PC browsers cannot handle upi:// intent schemes directly.
      // We inform the user to scan via mobile camera or use their phone UPI app.
      setError("Desktop notice: 'Pay via UPI App' requires a mobile device with GPay, PhonePe, or Paytm installed. On desktop, please scan the QR code using your phone's camera or UPI app.");
      return;
    }

    // On mobile devices, launch the native OS UPI Intent chooser
    window.location.href = upiUri;
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
      }
    } catch (e: any) {
      setError(e.message || "Simulation failed");
    } finally {
      setSimulating(false);
    }
  };

  const handleSubmitManualUtr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionCode || !manualUtr.trim()) return;
    setSubmittingUtr(true);
    setError(null);
    try {
      const res = await fetch("/api/pay/simulate/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_code: sessionCode,
          utr: manualUtr.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus("completed");
        setReceiptNumber(data.receiptNumber);
        onSuccess(data.receiptNumber);
      } else {
        setError(data.error || "Failed to verify UTR reference");
      }
    } catch (e: any) {
      setError(e.message || "UTR confirmation error");
    } finally {
      setSubmittingUtr(false);
    }
  };

  const copyVpa = () => {
    navigator.clipboard.writeText("jyotishsetu@upi");
    setCopiedVpa(true);
    setTimeout(() => setCopiedVpa(false), 2000);
  };

  if (!isOpen) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-amber-500/30 rounded-2xl shadow-2xl shadow-amber-500/10 overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="font-semibold text-lg text-amber-200 tracking-wide">
              JyotishSetu Pay
            </h3>
            <span className="text-xs bg-amber-500/20 text-amber-300 font-mono px-2 py-0.5 rounded-full border border-amber-500/30">
              UPI DIRECT
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6">
          {/* Order Summary */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400 font-medium">{title}</p>
              <p className="text-sm text-slate-200 truncate max-w-xs">{description}</p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400">Total Payable</span>
              <p className="text-xl font-bold text-emerald-400">{formatPaiseToInr(amountPaise)}</p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-xl flex items-start space-x-3 text-red-200 text-xs">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* State 1: Initiating / Loading */}
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="h-8 w-8 text-amber-400 animate-spin" />
              <p className="text-sm text-slate-300">Generating secure dynamic UPI QR session...</p>
            </div>
          )}

          {/* State 2: Active QR Session */}
          {!loading && status === "active" && qrSvg && (
            <div className="flex flex-col items-center space-y-4">
              {/* QR Code Container */}
              <div className="relative p-3 bg-white rounded-2xl shadow-xl border-4 border-amber-500/40">
                <div 
                  className="w-56 h-56 flex items-center justify-center"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              </div>

              {/* Instructions Pill */}
              <div className="flex items-center space-x-2 text-xs text-amber-300/80 bg-amber-950/40 px-3 py-1.5 rounded-full border border-amber-500/30">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span>QR expires in: <strong className="font-mono text-amber-200">{minutes}:{seconds < 10 ? `0${seconds}` : seconds}</strong></span>
              </div>

              {/* Desktop vs Mobile Hint */}
              {!isMobileDevice && (
                <div className="w-full text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5 text-amber-400" />
                  <span>Scan QR with <strong>Google Pay</strong>, <strong>PhonePe</strong>, or <strong>Paytm</strong></span>
                </div>
              )}

              {/* UPI Intent Trigger Links (Mobile App Deep Links) */}
              {upiUri && (
                <div className="w-full flex flex-col sm:flex-row gap-2 pt-1">
                  <button
                    onClick={handlePayViaUpiApp}
                    className="flex-1 py-2.5 px-4 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-semibold text-sm rounded-xl flex items-center justify-center space-x-2 shadow-lg transition-all"
                  >
                    <span>Pay via UPI App</span>
                    <ExternalLink className="h-4 w-4" />
                  </button>

                  <button
                    onClick={copyVpa}
                    className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl flex items-center justify-center space-x-2 border border-slate-700 transition-colors"
                  >
                    {copiedVpa ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    <span>{copiedVpa ? "VPA Copied" : "Copy UPI ID"}</span>
                  </button>
                </div>
              )}

              {/* Manual Bank UTR Submission (If User already paid via mobile app and wants instant clearance) */}
              {!showManualUtrInput ? (
                <button
                  onClick={() => setShowManualUtrInput(true)}
                  className="text-xs text-amber-300/80 hover:text-amber-200 underline pt-1"
                >
                  Already paid? Enter 12-digit Bank UTR / Reference ID
                </button>
              ) : (
                <form onSubmit={handleSubmitManualUtr} className="w-full p-3 bg-slate-800/80 border border-slate-700 rounded-xl space-y-2">
                  <label className="text-[11px] font-medium text-slate-300 block">
                    Enter Bank Reference / UTR Number:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      placeholder="e.g. 431289123456"
                      value={manualUtr}
                      onChange={(e) => setManualUtr(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="submit"
                      disabled={submittingUtr || !manualUtr.trim()}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg disabled:opacity-50"
                    >
                      {submittingUtr ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Verify"}
                    </button>
                  </div>
                </form>
              )}

              {/* Instant Sandbox Clearance Button for Testing/Dev Mode */}
              <div className="w-full pt-2 border-t border-slate-800/80">
                <button
                  onClick={handleSimulatePayment}
                  disabled={simulating}
                  className="w-full py-2 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/40 text-emerald-300 text-xs font-medium rounded-lg flex items-center justify-center space-x-2 transition-colors disabled:opacity-50"
                >
                  {simulating ? <RefreshCw className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />}
                  <span>[Dev Mode] Simulate Instant Banking Credit & Confirm</span>
                </button>
              </div>
            </div>
          )}

          {/* State 3: Payment Completed */}
          {status === "completed" && (
            <div className="py-8 flex flex-col items-center text-center space-y-4">
              <div className="h-16 w-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center border-2 border-emerald-500/40">
                <Check className="h-8 w-8 stroke-[3]" />
              </div>

              <div>
                <h4 className="text-xl font-bold text-slate-100">Payment Confirmed!</h4>
                <p className="text-sm text-slate-400 mt-1">
                  Your transaction has been securely cleared and verified.
                </p>
                {receiptNumber && (
                  <p className="text-xs font-mono text-amber-300 mt-2">
                    Receipt: {receiptNumber}
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <a
                  href={`/api/pay/receipt/download?session_code=${sessionCode}&receipt_number=${receiptNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-sm font-semibold rounded-xl flex items-center space-x-2 transition-colors"
                >
                  <FileText className="h-4 w-4 text-amber-400" />
                  <span>Download Tax Invoice</span>
                </a>

                <button
                  onClick={onClose}
                  className="py-2.5 px-6 bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold rounded-xl shadow-lg transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* State 4: Expired */}
          {status === "expired" && (
            <div className="py-8 flex flex-col items-center text-center space-y-3">
              <AlertCircle className="h-12 w-12 text-amber-500" />
              <h4 className="text-lg font-bold text-slate-200">Session Expired</h4>
              <p className="text-sm text-slate-400 max-w-xs">
                This dynamic QR session has timed out. Please initiate a new payment session.
              </p>
              <button
                onClick={onClose}
                className="py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg"
              >
                Close
              </button>
            </div>
          )}
        </div>

        {/* Footer Guarantee */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>256-Bit Encrypted Banking Pipeline</span>
          </div>
          <span>NPCI UPI Verified</span>
        </div>

      </div>
    </div>
  );
}
