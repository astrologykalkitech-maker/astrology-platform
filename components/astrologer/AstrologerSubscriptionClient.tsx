"use client";

import React, { useState } from "react";
import { Check, Sparkles, AlertCircle, RefreshCw, Shield, Zap, CreditCard, Lock } from "lucide-react";
import type { AstrologerSubscriptionRecord, PaymentPlanRecord } from "@/lib/financial/types";
import { formatPaiseToInr } from "@/lib/financial/pricing";
import { formatExactDateTime } from "@/lib/astrologer/format";
import { initiateSubscriptionPaymentAction } from "@/app/actions/payments";

export function AstrologerSubscriptionClient({
  subscription,
  availablePlans,
}: {
  subscription: AstrologerSubscriptionRecord | null;
  availablePlans: PaymentPlanRecord[];
}) {
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingConfirmPlan, setPendingConfirmPlan] = useState<PaymentPlanRecord | null>(null);

  const activePlan = subscription?.plan || availablePlans.find((p) => p.is_default);
  const leadsAllocated = subscription?.leads_allocated || activePlan?.lead_quota || 0;
  const leadsConsumed = subscription?.leads_consumed || 0;
  const remainingLeads = Math.max(0, leadsAllocated - leadsConsumed);
  const quotaPercent = leadsAllocated > 0 ? Math.min(100, Math.round((leadsConsumed / leadsAllocated) * 100)) : 0;

  const handleInitiateUpgrade = (plan: PaymentPlanRecord) => {
    setErrorMsg(null);
    if (plan.price_paise === 0) {
      handleProceedPayment(plan);
    } else {
      setPendingConfirmPlan(plan);
    }
  };

  const handleProceedPayment = async (plan: PaymentPlanRecord) => {
    try {
      setLoadingPlanId(plan.id);
      setErrorMsg(null);
      const res = await initiateSubscriptionPaymentAction({ planId: plan.id });
      if (res.success && res.data?.paymentUrl) {
        window.location.href = res.data.paymentUrl;
      } else {
        setErrorMsg(res.error || "Failed to initialize payment request with gateway.");
        setPendingConfirmPlan(null);
      }
    } catch {
      setErrorMsg("An unexpected network error occurred while contacting payment server.");
      setPendingConfirmPlan(null);
    } finally {
      setLoadingPlanId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Active Plan Overview */}
      <div className="relative overflow-hidden rounded-2xl border border-gold/30 bg-white p-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gold/15 text-gold-deep">
                <Sparkles className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-bold text-midnight">Current Membership: {activePlan?.name || "Free Tier"}</h2>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {subscription?.status === "active" ? "Active" : "Standard"}
              </span>
            </div>
            <p className="text-xs text-muted mt-1">
              Billing Period:{" "}
              {subscription?.current_period_end
                ? `Expires on ${formatExactDateTime(subscription.current_period_end)} (Manual Renewal Only)`
                : "Continuous Standard Membership"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Platform Commission:</span>
            <span className="text-sm font-bold text-midnight">
              {activePlan?.commission_percent !== undefined ? `${activePlan.commission_percent}%` : "10%"}
            </span>
          </div>
        </div>

        {/* Lead Allocation Progress Bar */}
        <div className="mt-6 rounded-xl border border-gold/20 bg-parchment/40 p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-midnight flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-gold-deep" />
              Client Lead Quota Usage
            </span>
            <span className="font-medium text-ink">
              {leadsConsumed} / {leadsAllocated} Leads Used ({remainingLeads} Remaining)
            </span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-gold/15">
            <div
              className="h-full bg-gradient-to-r from-gold to-amber-600 transition-all duration-500 rounded-full"
              style={{ width: `${quotaPercent}%` }}
            />
          </div>
          <p className="text-[11px] text-muted mt-2">
            {leadsAllocated === 0
              ? "Free plan includes 0 platform-assigned leads. Upgrade to Professional for 10 verified client leads per month."
              : `${remainingLeads} verified consultation leads remaining in your monthly billing period.`}
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Available Plans Grid */}
      <div>
        <h3 className="text-sm font-bold text-midnight mb-3">Available Astrologer Plans</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {availablePlans.map((plan) => {
            const isCurrent = subscription?.plan_id === plan.id || (!subscription && plan.is_default);
            return (
              <div
                key={plan.id}
                className={`relative flex flex-col justify-between rounded-2xl border p-5 transition-all ${
                  isCurrent
                    ? "border-gold bg-gradient-to-b from-parchment/60 to-white shadow-md ring-2 ring-gold/20"
                    : "border-gold/20 bg-white hover:border-gold/40 shadow-sm"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-bold text-midnight">{plan.name}</h4>
                    {plan.is_default && (
                      <span className="rounded-md bg-gold/15 px-2 py-0.5 text-[10px] font-semibold text-gold-deep">
                        Standard
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-1">{plan.description}</p>

                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-2xl font-black text-midnight">
                      {plan.price_paise === 0 ? "₹0" : formatPaiseToInr(plan.price_paise, false)}
                    </span>
                    <span className="text-xs text-muted">/ month</span>
                  </div>

                  <ul className="mt-4 space-y-2 text-xs text-ink/80">
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>{plan.lead_quota} Verified Client Leads / mo</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>{plan.commission_percent}% Marketplace Commission</span>
                    </li>
                    {plan.features?.map((feat, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 pt-4 border-t border-gold/15">
                  <button
                    disabled={isCurrent || loadingPlanId === plan.id}
                    onClick={() => handleInitiateUpgrade(plan)}
                    className={`w-full inline-flex items-center justify-center gap-2 rounded-xl py-2 px-4 text-xs font-semibold shadow transition-all ${
                      isCurrent
                        ? "bg-gold/15 text-gold-deep cursor-default"
                        : "bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] text-midnight hover:opacity-95"
                    } disabled:opacity-60`}
                  >
                    {loadingPlanId === plan.id ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : isCurrent ? (
                      "Active Plan"
                    ) : (
                      `Upgrade to ${plan.name}`
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confirmation Modal for Paid Upgrade */}
      {pendingConfirmPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-2xl border border-gold/30 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-2 text-midnight">
              <Lock className="h-5 w-5 text-gold-deep" />
              <h3 className="text-base font-bold">Confirm Subscription Upgrade</h3>
            </div>
            <p className="text-xs text-muted mt-2">
              You are upgrading to <strong className="text-midnight">{pendingConfirmPlan.name}</strong> for{" "}
              <strong className="text-midnight">{formatPaiseToInr(pendingConfirmPlan.price_paise, false)}/month</strong>.
            </p>
            <div className="mt-4 rounded-xl border border-gold/20 bg-parchment/40 p-3 text-xs text-ink/80 space-y-1.5">
              <div className="flex justify-between">
                <span>Monthly Verified Leads:</span>
                <span className="font-bold text-midnight">{pendingConfirmPlan.lead_quota} leads</span>
              </div>
              <div className="flex justify-between">
                <span>Marketplace Commission:</span>
                <span className="font-bold text-emerald-700">{pendingConfirmPlan.commission_percent}%</span>
              </div>
              <div className="flex justify-between">
                <span>Renewal Policy:</span>
                <span className="font-semibold text-muted">100% Manual (No Auto-Debit)</span>
              </div>
            </div>
            <p className="text-[11px] text-muted mt-3">
              Clicking below will securely redirect you to the Instamojo payment gateway. Your plan will activate only after successful payment verification.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                disabled={loadingPlanId === pendingConfirmPlan.id}
                onClick={() => setPendingConfirmPlan(null)}
                className="rounded-xl border border-gold/30 px-3 py-1.5 text-xs font-medium text-ink hover:bg-parchment"
              >
                Cancel
              </button>
              <button
                disabled={loadingPlanId === pendingConfirmPlan.id}
                onClick={() => handleProceedPayment(pendingConfirmPlan)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-4 py-1.5 text-xs font-bold text-midnight shadow hover:opacity-95 disabled:opacity-50"
              >
                {loadingPlanId === pendingConfirmPlan.id ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CreditCard className="h-3.5 w-3.5" />
                )}
                Proceed to Payment ({formatPaiseToInr(pendingConfirmPlan.price_paise, false)})
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 p-3 rounded-xl border border-gold/20 bg-parchment/40 text-[11px] text-muted">
        <Shield className="h-4 w-4 text-emerald-600 shrink-0" />
        <span>
          Policy: Subscriptions use 100% manual renewal. No auto-deductions occur on your payment card or bank.
        </span>
      </div>
    </div>
  );
}
