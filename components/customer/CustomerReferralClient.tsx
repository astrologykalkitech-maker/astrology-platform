"use client";

import React, { useState } from "react";
import { Copy, Check, Gift, Users, Award, ArrowRight } from "lucide-react";
import { applyCustomerReferralCode } from "@/app/actions/customer-referrals";

interface ReferralClientProps {
  referralCode: string;
  totalReferredCount: number;
  totalRewardsEarnedPaise: number;
  rewardPerReferralPaise: number;
  recentClaims: Array<{
    id: string;
    referredName: string;
    rewardAmountPaise: number;
    creditedAt: string;
  }>;
}

export function CustomerReferralClient({
  referralCode,
  totalReferredCount,
  totalRewardsEarnedPaise,
  rewardPerReferralPaise,
  recentClaims,
}: ReferralClientProps) {
  const [copied, setCopied] = useState(false);
  const [inputCode, setInputCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) return;

    setLoading(true);
    setStatusMsg(null);

    const res = await applyCustomerReferralCode(inputCode.trim());
    setLoading(false);

    if (res.success) {
      setStatusMsg({ type: "success", text: res.message || "Referral reward applied!" });
      setInputCode("");
    } else {
      setStatusMsg({ type: "error", text: res.error || "Failed to apply code" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Referral Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl border border-gold/30 bg-white shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-amber-50 text-amber-700">
              <Gift className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Per Referral Reward</p>
              <p className="text-xl font-bold text-midnight mt-0.5">₹{(rewardPerReferralPaise / 100).toFixed(0)}</p>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-gold/30 bg-white shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-purple-50 text-purple-700">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Friends Welcomed</p>
              <p className="text-xl font-bold text-midnight mt-0.5">{totalReferredCount}</p>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-gold/30 bg-white shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700">
              <Award className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Total Rewards Earned</p>
              <p className="text-xl font-bold text-emerald-700 mt-0.5">₹{(totalRewardsEarnedPaise / 100).toFixed(0)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Share Referral Code Card */}
      <div className="p-6 sm:p-7 rounded-2xl border border-gold/40 bg-white shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-midnight">Your Unique Referral Blessing Code</h3>
        <p className="text-xs text-muted max-w-xl">
          Share your referral code with spiritual seekers. When they claim it, both of you instantly receive ₹50 in promotional wallet credits to use on consultations.
        </p>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
          <div className="flex items-center justify-between px-4 py-2.5 bg-parchment/60 rounded-xl border border-gold/30 font-mono font-bold text-sm text-midnight tracking-widest flex-1 max-w-xs">
            <span>{referralCode}</span>
          </div>
          <button
            onClick={copyToClipboard}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-midnight text-white text-xs font-semibold hover:bg-gold hover:text-midnight transition shadow-2xs cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-400" /> Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" /> Copy Code
              </>
            )}
          </button>
        </div>
      </div>

      {/* Claim a Friend's Referral Code */}
      <div className="p-6 sm:p-7 rounded-2xl border border-slate-200 bg-white shadow-2xs space-y-4">
        <h3 className="text-sm font-bold text-midnight">Have a Referral Code?</h3>
        <p className="text-xs text-muted">
          Were you referred by a fellow seeker? Enter their referral code below to claim your ₹50 welcome wallet credit.
        </p>

        <form onSubmit={handleApplyCode} className="flex flex-col sm:flex-row gap-3 pt-1 max-w-md">
          <input
            type="text"
            placeholder="Enter code (e.g. KA123456)"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
            className="flex-1 px-3.5 py-2.5 text-xs font-mono uppercase tracking-wider rounded-xl border border-slate-300 bg-white outline-none focus:border-gold"
          />
          <button
            type="submit"
            disabled={loading || !inputCode.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-midnight hover:bg-slate-50 disabled:opacity-50 transition cursor-pointer"
          >
            {loading ? "Verifying..." : "Claim Blessing"}
          </button>
        </form>

        {statusMsg && (
          <div
            className={`p-3 rounded-xl text-xs font-medium ${
              statusMsg.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-rose-50 text-rose-800 border border-rose-200"
            }`}
          >
            {statusMsg.text}
          </div>
        )}
      </div>

      {/* Recent Referral History */}
      {recentClaims.length > 0 && (
        <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-2xs space-y-3">
          <h4 className="text-xs font-bold text-midnight uppercase tracking-wider">Referral Reward History</h4>
          <div className="divide-y divide-slate-100">
            {recentClaims.map((claim) => (
              <div key={claim.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <p className="font-semibold text-midnight">{claim.referredName}</p>
                  <p className="text-[10px] text-muted">{new Date(claim.creditedAt).toLocaleDateString()}</p>
                </div>
                <span className="font-bold text-emerald-700">+₹{(claim.rewardAmountPaise / 100).toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
