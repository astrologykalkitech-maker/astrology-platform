"use client";

import React, { useState, useEffect, useTransition } from "react";
import { Landmark, Smartphone, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import {
  saveAstrologerBeneficiaryAction,
  getAstrologerBeneficiaryAction,
  type AstrologerBeneficiaryView,
} from "@/app/actions/astrologer-beneficiaries";

export function BeneficiarySettingsCard() {
  const [beneficiary, setBeneficiary] = useState<AstrologerBeneficiaryView | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states
  const [accountType, setAccountType] = useState<"bank_account" | "upi_id">("bank_account");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [bankName, setBankName] = useState("");
  const [upiId, setUpiId] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await getAstrologerBeneficiaryAction();
      if (res.success && res.data) {
        setBeneficiary(res.data);
        setBeneficiaryName(res.data.beneficiary_name);
        setAccountType(res.data.account_type);
        if (res.data.bank_ifsc) setBankIfsc(res.data.bank_ifsc);
        if (res.data.bank_name) setBankName(res.data.bank_name);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load beneficiary settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!beneficiaryName.trim()) {
      setErrorMsg("Beneficiary legal name is required.");
      return;
    }

    if (accountType === "bank_account") {
      if (!accountNumber || accountNumber.length < 8 || accountNumber.length > 20) {
        setErrorMsg("Valid bank account number (8-20 digits) is required.");
        return;
      }
      if (accountNumber !== confirmAccountNumber) {
        setErrorMsg("Bank account numbers do not match.");
        return;
      }
      if (!bankIfsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(bankIfsc.trim())) {
        setErrorMsg("Valid 11-character Indian IFSC code is required (e.g. HDFC0001234).");
        return;
      }
    } else {
      if (!upiId || !/^[\w.-]{2,64}@[a-zA-Z]{2,64}$/.test(upiId.trim())) {
        setErrorMsg("Valid UPI VPA format required (e.g. username@okhdfcbank).");
        return;
      }
    }

    startTransition(async () => {
      try {
        const payload = {
          account_type: accountType,
          beneficiary_name: beneficiaryName.trim(),
          ...(accountType === "bank_account"
            ? {
                account_number: accountNumber.trim(),
                bank_ifsc: bankIfsc.trim().toUpperCase(),
                bank_name: bankName.trim() || undefined,
              }
            : {
                upi_id: upiId.trim().toLowerCase(),
              }),
        };

        const res = await saveAstrologerBeneficiaryAction(payload);
        if (res.success && res.data) {
          setBeneficiary(res.data);
          setSuccessMsg("Payout account successfully registered and verified.");
          setAccountNumber("");
          setConfirmAccountNumber("");
          setUpiId("");
        } else {
          setErrorMsg(res.error || "Failed to update payout beneficiary.");
        }
      } catch (err: any) {
        setErrorMsg(err.message || "An unexpected error occurred.");
      }
    });
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-gold/25 bg-white p-5 shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)]">
      <div className="flex items-center justify-between pb-4 border-b border-line">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold-deep">
            <Landmark className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-display text-base font-semibold text-midnight">Payout Beneficiary Account</h3>
            <p className="text-xs text-muted">Direct settlement bank account or UPI ID for consultation earnings.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {beneficiary?.is_active && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" /> Active & Verified
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-8 flex items-center justify-center gap-2 text-xs text-muted">
          <RefreshCw className="h-4 w-4 animate-spin text-gold-deep" /> Loading beneficiary details...
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {beneficiary && (
            <div className="rounded-xl border border-gold/30 bg-parchment/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Current Active Payout Channel</p>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-muted">Account Holder:</span>
                  <p className="font-semibold text-ink">{beneficiary.beneficiary_name}</p>
                </div>
                <div>
                  <span className="text-xs text-muted">
                    {beneficiary.account_type === "bank_account" ? "Masked Account:" : "UPI ID:"}
                  </span>
                  <p className="font-mono font-semibold text-midnight">{beneficiary.masked_account_number}</p>
                </div>
                {beneficiary.bank_ifsc && (
                  <div>
                    <span className="text-xs text-muted">IFSC Code:</span>
                    <p className="font-mono text-ink uppercase">{beneficiary.bank_ifsc}</p>
                  </div>
                )}
                {beneficiary.bank_name && (
                  <div>
                    <span className="text-xs text-muted">Bank Name:</span>
                    <p className="text-ink">{beneficiary.bank_name}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer">
                <input
                  type="radio"
                  name="account_type"
                  checked={accountType === "bank_account"}
                  onChange={() => setAccountType("bank_account")}
                  className="text-gold-deep focus:ring-gold"
                />
                <Landmark className="h-4 w-4 text-gold-deep" /> Bank Transfer (NEFT/IMPS)
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer">
                <input
                  type="radio"
                  name="account_type"
                  checked={accountType === "upi_id"}
                  onChange={() => setAccountType("upi_id")}
                  className="text-gold-deep focus:ring-gold"
                />
                <Smartphone className="h-4 w-4 text-gold-deep" /> Instant UPI VPA
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Beneficiary Legal Full Name</label>
                <input
                  type="text"
                  value={beneficiaryName}
                  onChange={(e) => setBeneficiaryName(e.target.value)}
                  placeholder="As per bank passbook / PAN"
                  className="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink focus:border-gold focus:outline-none"
                  required
                />
              </div>

              {accountType === "bank_account" ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-muted mb-1">IFSC Code</label>
                    <input
                      type="text"
                      value={bankIfsc}
                      onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                      placeholder="e.g. SBIN0001234"
                      className="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink uppercase focus:border-gold focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted mb-1">Bank Account Number</label>
                    <input
                      type="password"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      placeholder="Enter account number"
                      className="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink focus:border-gold focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted mb-1">Confirm Account Number</label>
                    <input
                      type="text"
                      value={confirmAccountNumber}
                      onChange={(e) => setConfirmAccountNumber(e.target.value)}
                      placeholder="Re-enter account number"
                      className="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink focus:border-gold focus:outline-none"
                      required
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-muted mb-1">Bank Name (Optional)</label>
                    <input
                      type="text"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="e.g. State Bank of India"
                      className="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink focus:border-gold focus:outline-none"
                    />
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-muted mb-1">UPI ID / VPA</label>
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="e.g. name@okhdfcbank"
                    className="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink focus:border-gold focus:outline-none"
                    required
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Protected by AES-256-GCM authenticated encryption.</span>
              </div>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center justify-center rounded-xl bg-gold px-4 py-2 text-xs font-semibold text-midnight hover:bg-gold-light disabled:opacity-50 transition-colors"
              >
                {isPending ? "Encrypting & Saving..." : beneficiary ? "Update Payout Channel" : "Register Payout Channel"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
