"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Wallet,
  ShieldCheck,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  QrCode,
  Building,
  Smartphone,
  Copy,
  Check,
  Clock,
  ExternalLink,
} from "lucide-react";

interface WalletRechargeModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: "customer" | "astrologer";
  onSuccess?: () => void;
}

const PRESET_AMOUNTS = [100, 250, 500, 1000, 2000, 5000];

export function WalletRechargeModal({
  isOpen,
  onClose,
  userRole,
  onSuccess,
}: WalletRechargeModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number>(500);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"gateway" | "upi_manual">("gateway");

  // Manual UTR submission state
  const [utrInput, setUtrInput] = useState<string>("");

  // Gateway QR and intent states
  const [showQRView, setShowQRView] = useState(false);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [upiUri, setUpiUri] = useState<string | null>(null);
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [merchantVpa, setMerchantVpa] = useState<string>("karmicascension@upi");
  const [secondsRemaining, setSecondsRemaining] = useState(600);
  const [copiedVpa, setCopiedVpa] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Active order tracking for status polling
  const [activeOrderNumber, setActiveOrderNumber] = useState<string | null>(null);
  const [testingModeEnabled, setTestingModeEnabled] = useState(false);
  const [simulating, setSimulating] = useState(false);

  // Portal mount & focus restoration state
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Capture trigger element and handle background scroll lock & escape key
  useEffect(() => {
    if (!isOpen) return;

    triggerRef.current = (document.activeElement as HTMLElement) || null;

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    // Initial focus on dialog
    const timer = setTimeout(() => {
      dialogRef.current?.focus();
    }, 50);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      if (triggerRef.current && typeof triggerRef.current.focus === "function") {
        triggerRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  // Status polling for QR view
  useEffect(() => {
    if (!showQRView || (!sessionCode && !activeOrderNumber)) return;

    const interval = setInterval(async () => {
      try {
        const queryParam = activeOrderNumber
          ? `order_number=${encodeURIComponent(activeOrderNumber)}`
          : `session_code=${encodeURIComponent(sessionCode || "")}`;
        const res = await fetch(`/api/payments/wallet/recharge/status?${queryParam}`);
        const data = await res.json();
        if (data.success && data.status === "successful") {
          setSuccessMsg("Payment confirmed! Your wallet balance has been updated.");
          setShowQRView(false);
          setTimeout(() => {
            onClose();
            if (onSuccess) onSuccess();
            else window.location.reload();
          }, 1500);
        }
      } catch (e) {
        // Silent poll error
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [showQRView, sessionCode, activeOrderNumber, onClose, onSuccess]);

  // Countdown timer for active QR session
  useEffect(() => {
    if (!showQRView || secondsRemaining <= 0) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [showQRView, secondsRemaining]);

  if (!isOpen || !mounted) return null;

  const effectiveAmount = customAmount ? parseInt(customAmount, 10) || 0 : selectedAmount;
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;

  const copyToClipboard = (text: string, type: "vpa" | "ref") => {
    navigator.clipboard.writeText(text);
    if (type === "vpa") {
      setCopiedVpa(true);
      setTimeout(() => setCopiedVpa(false), 2000);
    } else {
      setCopiedRef(true);
      setTimeout(() => setCopiedRef(false), 2000);
    }
  };

  const handleRecharge = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (effectiveAmount < 10) {
      setErrorMsg("Minimum recharge amount is ₹10.");
      return;
    }

    setLoading(true);
    try {
      if (paymentMethod === "gateway") {
        // Create dynamic QR / Online gateway recharge intent
        const res = await fetch("/api/payments/wallet/recharge/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount_rupees: effectiveAmount,
            user_role: userRole,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to initiate online recharge session.");
        }

        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
          return;
        }

        if (data.qrSession) {
          setQrSvg(data.qrSession.qrSvg);
          setUpiUri(data.qrSession.upiUri);
          setSessionCode(data.qrSession.sessionCode);
          setActiveOrderNumber(data.orderNumber || null);
          setTestingModeEnabled(Boolean(data.testingModeEnabled));
          if (data.qrSession.merchantVpa) setMerchantVpa(data.qrSession.merchantVpa);
          setSecondsRemaining(600);
          setShowQRView(true);
        } else {
          setSuccessMsg(`Wallet recharge request initiated for ₹${effectiveAmount}!`);
          setTimeout(() => {
            onClose();
            if (onSuccess) onSuccess();
            else window.location.reload();
          }, 1500);
        }
      } else {
        // Manual UPI / UTR Submission
        const cleanUtr = utrInput.trim();
        if (!cleanUtr || cleanUtr.length !== 12 || !/^[A-Za-z0-9]{12}$/.test(cleanUtr)) {
          throw new Error("Please enter a valid 12-digit alphanumeric Bank UTR / Reference ID.");
        }

        const res = await fetch("/api/payments/wallet/recharge/utr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount_rupees: effectiveAmount,
            utr: cleanUtr,
            user_role: userRole,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to submit UTR reference.");
        }

        setSuccessMsg("UTR reference submitted for manual verification. Your balance will be credited once verified by admin.");
        setTimeout(() => {
          onClose();
          if (onSuccess) onSuccess();
          else window.location.reload();
        }, 2500);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Recharge failed. Please retry.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmQrPaid = async () => {
    if (!utrInput || utrInput.trim().length !== 12) {
      setErrorMsg("Please enter the 12-digit Bank UTR / Transaction ID from your payment app.");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/payments/wallet/recharge/utr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_rupees: effectiveAmount,
          utr: utrInput.trim(),
          user_role: userRole,
          session_code: sessionCode,
          order_number: activeOrderNumber,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to submit UTR reference.");
      }

      setSuccessMsg("UTR reference submitted for manual verification. Your wallet balance will update once approved by admin.");
      setTimeout(() => {
        onClose();
        if (onSuccess) onSuccess();
        else window.location.reload();
      }, 2500);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Verification error. Please retry.");
    } finally {
      setLoading(false);
    }
  };

  const handleSimulatePayment = async () => {
    if (!activeOrderNumber && !sessionCode) return;
    setSimulating(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/payments/wallet/recharge/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_number: activeOrderNumber,
          session_code: sessionCode,
          utr: `SIM${Date.now().toString().slice(-9)}`,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Zero-Cost test simulation failed.");
      }

      setSuccessMsg("Zero-Cost Test: Payment simulated and wallet credited successfully!");
      setShowQRView(false);
      setTimeout(() => {
        onClose();
        if (onSuccess) onSuccess();
        else window.location.reload();
      }, 1500);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Simulation failed.");
    } finally {
      setSimulating(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-950/85 backdrop-blur-md overflow-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-recharge-modal-title"
        tabIndex={-1}
        className="relative w-full max-w-md max-h-[calc(100dvh-24px)] sm:max-h-[calc(100dvh-36px)] flex flex-col overflow-hidden rounded-2xl border border-amber-500/35 bg-slate-900 text-slate-100 shadow-2xl shadow-amber-500/10 my-auto focus:outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300">
              <Wallet className="h-5 w-5" />
            </span>
            <div>
              <h3 id="wallet-recharge-modal-title" className="font-display text-base font-bold text-white">
                {userRole === "astrologer" ? "Astrologer Operating Wallet" : "Customer Consultation Wallet"}
              </h3>
              <p className="text-[11px] text-slate-400">
                {userRole === "astrologer" ? "Add balance to your operating wallet" : "Instant balance for Vedic consultations"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-4">
          {!showQRView ? (
            <>
              {/* Preset Buttons */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Select Recharge Amount (₹)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PRESET_AMOUNTS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => {
                        setSelectedAmount(amt);
                        setCustomAmount("");
                      }}
                      className={`py-2 rounded-xl text-xs font-bold border transition ${
                        selectedAmount === amt && !customAmount
                          ? "bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] text-midnight border-gold shadow-sm"
                          : "bg-slate-800/80 text-slate-200 border-white/10 hover:border-gold/40"
                      }`}
                    >
                      ₹{amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Amount Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Or Enter Custom Amount (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-xs font-bold text-slate-400">₹</span>
                  <input
                    type="number"
                    min="10"
                    max="100000"
                    placeholder="Enter amount"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-slate-950 px-8 py-2 text-sm font-bold text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Choose Payment Mode
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("gateway")}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                      paymentMethod === "gateway"
                        ? "border-amber-400 bg-amber-500/15 text-white"
                        : "border-white/10 bg-slate-800/50 text-slate-400 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-white">
                      <QrCode className="h-4 w-4 text-amber-300" />
                      <span>Instant Online Pay</span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1">UPI QR, GPay, PhonePe, Cards</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod("upi_manual")}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                      paymentMethod === "upi_manual"
                        ? "border-amber-400 bg-amber-500/15 text-white"
                        : "border-white/10 bg-slate-800/50 text-slate-400 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-white">
                      <Building className="h-4 w-4 text-amber-300" />
                      <span>Direct UPI / UTR</span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1">Pay to VPA & Submit 12-digit UTR</span>
                  </button>
                </div>
              </div>

              {/* Manual UPI Guidance if selected */}
              {paymentMethod === "upi_manual" && (
                <div className="rounded-xl border border-white/10 bg-slate-950 p-3.5 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Platform Official UPI ID:</span>
                    <span className="font-mono font-bold text-amber-300 select-all">karmicascension@upi</span>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Enter 12-digit Bank Reference / UTR Number:
                    </label>
                    <input
                      type="text"
                      maxLength={12}
                      placeholder="e.g. 412345678901"
                      value={utrInput}
                      onChange={(e) => setUtrInput(e.target.value.replace(/[^0-9A-Za-z]/g, ""))}
                      className="w-full rounded-lg border border-white/20 bg-slate-900 px-3 py-1.5 font-mono text-xs text-white uppercase placeholder-slate-600 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            /* QR Code Display View */
            <div className="space-y-4 text-center">
              <div className="bg-slate-950/80 border border-amber-500/30 rounded-xl p-3 flex items-center justify-between">
                <span className="text-xs text-slate-300">Total Amount Payable:</span>
                <span className="font-bold text-base text-emerald-400">₹{effectiveAmount}</span>
              </div>

              {qrSvg && (
                <div className="flex flex-col items-center">
                  <div className="p-2 bg-white rounded-xl shadow-xl border-2 border-amber-400/50">
                    <div
                      className="w-44 h-44 aspect-square flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
                      dangerouslySetInnerHTML={{ __html: qrSvg }}
                    />
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-amber-300 bg-amber-950/60 px-3 py-1 rounded-full border border-amber-500/30">
                    <Clock className="h-3.5 w-3.5" />
                    <span>
                      Session expires in:{" "}
                      <strong className="font-mono">
                        {minutes}:{seconds < 10 ? `0${seconds}` : seconds}
                      </strong>
                    </span>
                  </div>
                </div>
              )}

              {/* UPI Actions: Pay via App, Copy VPA, Copy Ref */}
              <div className="space-y-2">
                {upiUri && (
                  <a
                    href={upiUri}
                    className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center space-x-2 shadow-lg transition"
                  >
                    <Smartphone className="h-4 w-4" />
                    <span>Open in UPI App (GPay / PhonePe / Paytm)</span>
                    <ExternalLink className="h-3.5 w-3.5 opacity-80" />
                  </a>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(merchantVpa, "vpa")}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg flex items-center justify-center space-x-1 border border-slate-700 transition"
                  >
                    {copiedVpa ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedVpa ? "Copied UPI" : "Copy UPI ID"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => sessionCode && copyToClipboard(sessionCode, "ref")}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg flex items-center justify-center space-x-1 border border-slate-700 transition"
                  >
                    {copiedRef ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedRef ? "Copied Ref" : "Copy Ref Code"}</span>
                  </button>
                </div>
              </div>

              {/* UTR input to finalize credit */}
              <div className="text-left bg-slate-950 p-3 rounded-xl border border-white/10 space-y-2">
                <label className="block text-[11px] font-semibold text-slate-300">
                  After paying, enter the 12-digit UTR / Reference ID:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={12}
                    placeholder="12-digit Bank UTR"
                    value={utrInput}
                    onChange={(e) => setUtrInput(e.target.value.replace(/[^0-9A-Za-z]/g, ""))}
                    className="flex-1 rounded-lg border border-white/20 bg-slate-900 px-3 py-1.5 font-mono text-xs text-white uppercase focus:border-amber-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={loading || utrInput.trim().length !== 12}
                    onClick={handleConfirmQrPaid}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition"
                  >
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Verify"}
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowQRView(false)}
                className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
              >
                ← Back to payment methods
              </button>

              {/* Zero-Cost Testing Mode Simulation Action */}
              {(testingModeEnabled || process.env.NODE_ENV !== "production") && (
                <div className="w-full pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={handleSimulatePayment}
                    disabled={simulating}
                    className="w-full py-2 bg-emerald-950/70 hover:bg-emerald-900/90 border border-emerald-500/50 text-emerald-300 text-xs font-semibold rounded-xl flex items-center justify-center space-x-2 transition-colors disabled:opacity-50 shadow-md cursor-pointer"
                  >
                    {simulating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-4 w-4 text-emerald-400" />}
                    <span>Test Sandbox: Simulate Successful Payment & Credit</span>
                  </button>
                  <p className="text-[10px] text-center text-slate-400 mt-1">
                    Super Admin Zero-Cost Testing Mode Active: Instantly simulate payment clearing and credit your wallet without real bank charges.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Status Messages */}
          {errorMsg && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Submit Action when not in QR view */}
          {!showQRView && (
            <button
              type="button"
              disabled={loading}
              onClick={handleRecharge}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] py-3 text-xs font-bold text-midnight shadow hover:brightness-105 transition disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Generating Payment Session...</span>
                </>
              ) : (
                <>
                  <span>Proceed to Pay ₹{effectiveAmount}</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          )}

          <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400 pt-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>256-bit Encrypted Banking & Atomic Double-Entry Ledger</span>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : null;
}
