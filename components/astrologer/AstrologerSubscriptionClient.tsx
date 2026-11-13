"use client";

import React, { useState } from "react";
import { Check, Sparkles, AlertCircle, RefreshCw, Shield, Zap, CreditCard, Lock, Ban, History } from "lucide-react";
import type { AstrologerSubscriptionRecord, PaymentPlanRecord } from "@/lib/financial/types";
import { formatPaiseToInr } from "@/lib/financial/pricing";
import { formatExactDateTime } from "@/lib/astrologer/format";
import { JyotishPayModal } from "@/components/pay/JyotishPayModal";
import { AstrologerCancelSubscriptionModal } from "./AstrologerCancelSubscriptionModal";

export function AstrologerSubscriptionClient({
  subscription,
  availablePlans,
  astrologerId,
}: {
  subscription: AstrologerSubscriptionRecord | null;
  availablePlans: PaymentPlanRecord[];
  astrologerId?: string;
}) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [selectedPlanForPay, setSelectedPlanForPay] = useState<PaymentPlanRecord | null>(null);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  // Strictly determine active paid status. If no subscription, or if cancelled/expired, fall back strictly to Free plan
  const hasPaidSubscription = subscription && subscription.status === "active" && subscription.plan?.slug === "professional";
  const freePlan = availablePlans.find((p) => p.slug === "free") || availablePlans.find((p) => p.is_default) || availablePlans[0];
  const activePlan = hasPaidSubscription ? subscription.plan : freePlan;

  const leadsAllocated = hasPaidSubscription ? (subscription.leads_allocated || activePlan?.lead_quota || 0) : 0;
  const leadsConsumed = hasPaidSubscription ? (subscription.leads_consumed || 0) : 0;
  const remainingLeads = Math.max(0, leadsAllocated - leadsConsumed);
  const quotaPercent = leadsAllocated > 0 ? Math.min(100, Math.round((leadsConsumed / leadsAllocated) * 100)) : 0;

  const isPaidActive = Boolean(hasPaidSubscription);

  const handleInitiateUpgrade = (plan: PaymentPlanRecord) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setSelectedPlanForPay(plan);
    setIsPayModalOpen(true);
  };

  const handlePaymentSuccess = (receiptNo: string) => {
    setTimeout(() => {
      setIsPayModalOpen(false);
      window.location.reload();
    }, 2500);
  };

  const handleConfirmCancel = async (reason: string, feedback: string) => {
    const res = await fetch("/api/astrologer/subscription/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, feedback }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to cancel subscription.");
    }

    setSuccessMsg("Your subscription has been cancelled. Your account is now on the Free tier.");
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">
          <Sparkles className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Current Active Plan Overview */}
      <div className="relative overflow-hidden rounded-2xl border border-gold/30 bg-white p-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gold/15 text-gold-deep">
                <Sparkles className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-bold text-midnight">Current Membership: {activePlan?.name || "Free Tier"}</h2>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  subscription?.status === "active"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : subscription?.status === "cancelled"
                    ? "bg-slate-100 text-slate-700 border border-slate-300"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                }`}
              >
                {subscription?.status === "active" ? "Active" : subscription?.status === "cancelled" ? "Cancelled (Free Tier)" : "Standard"}
              </span>
            </div>
            <p className="text-xs text-muted mt-1">
              Billing Period:{" "}
              {subscription?.current_period_end && subscription.status === "active"
                ? `Expires on ${formatExactDateTime(subscription.current_period_end)} (Manual Renewal Only)`
                : "Continuous Standard Membership"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-xs text-muted block">Platform Commission:</span>
              <span className="text-sm font-bold text-midnight">
                {activePlan?.commission_percent ?? 10}%
              </span>
            </div>

            {/* Cancel Subscription Option for Active Paid Subscriptions */}
            {isPaidActive && (
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-50/80 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 transition shadow-xs"
              >
                <Ban className="h-3.5 w-3.5 text-red-600" />
                Cancel Subscription
              </button>
            )}
          </div>
        </div>

        {/* Lead Quota Usage Progress */}
        <div className="mt-6 pt-6 border-t border-gold/20">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-medium text-midnight">
              Monthly Verified Leads Quota: <strong className="text-gold-deep">{remainingLeads}</strong> remaining of {leadsAllocated}
            </span>
            <span className="text-muted">{quotaPercent}% consumed</span>
          </div>
          <div className="w-full bg-parchment h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-gold to-gold-deep h-full rounded-full transition-all duration-300"
              style={{ width: `${quotaPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Available Plans Catalog */}
      <div>
        <h3 className="text-base font-bold text-midnight mb-3">Available Membership Plans</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {availablePlans.map((plan) => {
            const isCurrent = isPaidActive ? (activePlan?.id === plan.id || plan.slug === "professional") : (plan.slug === "free");
            return (
              <div
                key={plan.id}
                className={`relative flex flex-col justify-between rounded-2xl border p-6 transition-all ${
                  isCurrent
                    ? "border-gold bg-parchment/30 shadow-md ring-1 ring-gold/40"
                    : "border-gold/30 bg-white hover:border-gold/60 hover:shadow-sm"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-base font-bold text-midnight">{plan.name}</h4>
                    {plan.slug === "professional" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5 text-[11px] font-bold text-gold-deep">
                        <Zap className="h-3 w-3" /> Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mb-4">{plan.description}</p>

                  <div className="mb-6">
                    <span className="text-2xl font-black text-midnight">
                      {formatPaiseToInr(plan.price_paise, false)}
                    </span>
                    <span className="text-xs text-muted"> / month</span>
                  </div>

                  <ul className="space-y-2 mb-6">
                    {(plan.features as string[]).map((feature, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-xs text-ink/80">
                        <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <button
                    disabled={isCurrent}
                    onClick={() => handleInitiateUpgrade(plan)}
                    className={`w-full inline-flex items-center justify-center gap-2 rounded-xl py-2 px-4 text-xs font-semibold shadow transition-all ${
                      isCurrent
                        ? "bg-gold/15 text-gold-deep cursor-default"
                        : "bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] text-midnight hover:opacity-95"
                    } disabled:opacity-60`}
                  >
                    {isCurrent ? "Active Plan" : `Upgrade to ${plan.name}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cancellation Dialog Modal */}
      {isPaidActive && (
        <AstrologerCancelSubscriptionModal
          isOpen={isCancelModalOpen}
          onClose={() => setIsCancelModalOpen(false)}
          onConfirm={handleConfirmCancel}
          planName={activePlan?.name || "Professional"}
          currentPeriodEnd={subscription?.current_period_end}
        />
      )}

      {/* JyotishSetu Pay Native Payment Modal */}
      {selectedPlanForPay && (
        <JyotishPayModal
          isOpen={isPayModalOpen}
          onClose={() => setIsPayModalOpen(false)}
          amountPaise={selectedPlanForPay.price_paise}
          entityType="subscription"
          title={`Membership: ${selectedPlanForPay.name}`}
          description={`Activate monthly subscription for ${selectedPlanForPay.name} with ${selectedPlanForPay.lead_quota} verified leads.`}
          planId={selectedPlanForPay.id}
          astrologerId={astrologerId || subscription?.astrologer_id}
          onSuccess={handlePaymentSuccess}
        />
      )}

      <div className="flex items-center gap-2 p-3 rounded-xl border border-gold/20 bg-parchment/40 text-[11px] text-muted">
        <Shield className="h-4 w-4 text-emerald-600 shrink-0" />
        <span>
          Policy: Subscriptions use 100% manual renewal powered by JyotishSetu Pay. No auto-deductions occur on your payment card or bank.
        </span>
      </div>
    </div>
  );
}
