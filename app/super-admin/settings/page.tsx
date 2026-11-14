"use client";

import { useEffect, useState } from "react";
import { Sliders, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { getPlatformSettings, updatePlatformSetting } from "@/app/actions/admin-system";

export default function SuperAdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Local state edit map
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});

  const loadSettings = async () => {
    setLoading(true);
    const res = await getPlatformSettings();
    if (res.success) {
      const values: Record<string, unknown> = {};
      for (const s of res.data) {
        values[s.key] = s.value;
      }
      setFormValues(values);
    }
    setLoading(false);
  };

  useEffect(() => {
    let ignore = false;
    async function fetchSettings() {
      const res = await getPlatformSettings();
      if (!ignore) {
        if (res.success) {
          const values: Record<string, unknown> = {};
          for (const s of res.data) {
            values[s.key] = s.value;
          }
          setFormValues(values);
        }
        setLoading(false);
      }
    }

    fetchSettings();
    return () => {
      ignore = true;
    };
  }, []);

  const handleSaveSetting = async (key: string) => {
    setSavingKey(key);
    setMessage(null);

    const val = formValues[key];
    const res = await updatePlatformSetting(key, val, "Updated via Platform Settings UI");

    setSavingKey(null);

    if (!res.success) {
      setMessage({ type: "error", text: res.error });
      return;
    }

    if (key === "payment_testing_mode_enabled") {
      const isEnabled = Boolean(val);
      setMessage({
        type: "success",
        text: isEnabled
          ? "Payment Testing Mode enabled successfully. Zero-cost testing is now ACTIVE."
          : "Payment Testing Mode disabled successfully. Live real-money charges are now ACTIVE.",
      });
    } else {
      setMessage({ type: "success", text: `Setting '${key}' saved successfully.` });
    }
    loadSettings();
  };

  return (
    <div className="space-y-6 rise-in">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-r from-midnight via-plum to-midnight p-6 text-white shadow-xl">
        <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-gold/10 blur-2xl pointer-events-none" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/15 px-3 py-0.5 text-[11px] font-semibold text-champagne backdrop-blur-sm mb-2">
              <Sliders className="h-3.5 w-3.5 text-gold" />
              <span>Global Configurations</span>
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-ivory">
              Platform Configuration & Settings
            </h1>
            <p className="text-xs text-parchment/80 mt-1 max-w-xl">
              Backed by live database settings. Fine-tune lead assignment policies, concurrency throttles, and operational safeguards.
            </p>
          </div>
          <button
            onClick={loadSettings}
            type="button"
            disabled={loading}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-gold/30 bg-midnight/80 px-4 py-2 text-xs font-semibold text-champagne shadow-sm hover:bg-gold/20 hover:border-gold transition-all"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-gold" : "text-gold"}`} />
            Reload Settings
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`flex items-center gap-3 rounded-2xl border p-4 text-xs font-medium backdrop-blur-sm shadow-md ${
            message.type === "success"
              ? "border-emerald-300/60 bg-emerald-950/20 text-emerald-800 dark:text-emerald-200"
              : "border-red-300/60 bg-red-950/20 text-red-800 dark:text-red-200"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Settings Grid */}
      <div className="space-y-4">
        {/* 0. Payment Testing Mode (Sandbox / No Payment) */}
        <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-50/70 via-white to-amber-50/30 p-6 shadow-sm backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                <h3 className="text-sm font-bold text-midnight">
                  JyotishSetu Pay — Zero-Cost Testing Mode
                </h3>
                <span className="text-[10px] bg-amber-500/15 text-amber-800 font-semibold px-2 py-0.5 rounded-full border border-amber-500/30">
                  {formValues["payment_testing_mode_enabled"] ? "TESTING ACTIVE" : "LIVE CHARGES"}
                </span>
              </div>
              <p className="text-xs text-muted mt-1 max-w-xl">
                When enabled, astrologers and seekers can test subscription upgrades and booking checkouts without making real bank payments. When turned OFF, JyotishSetu Pay strictly operates in live mode and charges real money via UPI/Bank.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(formValues["payment_testing_mode_enabled"])}
                  onChange={(e) =>
                    setFormValues((prev) => ({
                      ...prev,
                      payment_testing_mode_enabled: e.target.checked,
                    }))
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
              <button
                type="button"
                disabled={savingKey === "payment_testing_mode_enabled"}
                onClick={() => handleSaveSetting("payment_testing_mode_enabled")}
                className="rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md hover:brightness-110 disabled:opacity-40 transition-all cursor-pointer"
              >
                {savingKey === "payment_testing_mode_enabled" ? "Saving..." : "Save Mode"}
              </button>
            </div>
          </div>
        </div>

        {/* 0B. Live UPI QR Configuration (Merchant & Personal UPI support) */}
        <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-r from-sky-50/50 via-white to-sky-50/20 p-6 shadow-sm backdrop-blur-sm">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-midnight flex items-center gap-2">
                  <span>📱 Universal UPI QR Config (Merchant & Personal)</span>
                  <span className="text-[10px] bg-sky-500/15 text-sky-800 font-semibold px-2 py-0.5 rounded-full border border-sky-500/30">
                    Option B: Real-Time Aggregator
                  </span>
                </h3>
                <p className="text-xs text-muted mt-1 max-w-2xl">
                  Configure the receiving UPI ID for all dynamic QR codes. Supports both <strong>Merchant Business Accounts</strong> (PhonePe Business, Paytm for Business, Cashfree, Google Pay Business) and <strong>Personal UPI IDs</strong> (GPay/PhonePe/BHIM/Bank UPI).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  UPI VPA / ID (pa=)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. yourname@upi or business@okhdfcbank"
                    value={String(formValues["payment_upi_vpa"] ?? "jyotishsetu@upi")}
                    onChange={(e) =>
                      setFormValues((prev) => ({
                        ...prev,
                        payment_upi_vpa: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs text-midnight outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                  <button
                    type="button"
                    disabled={savingKey === "payment_upi_vpa"}
                    onClick={() => handleSaveSetting("payment_upi_vpa")}
                    className="rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white shadow hover:bg-slate-800 disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Payee Name (pn=)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="JyotishSetu Astrology Services"
                    value={String(formValues["payment_merchant_name"] ?? "JyotishSetu Astrology Services")}
                    onChange={(e) =>
                      setFormValues((prev) => ({
                        ...prev,
                        payment_merchant_name: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs text-midnight outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                  <button
                    type="button"
                    disabled={savingKey === "payment_merchant_name"}
                    onClick={() => handleSaveSetting("payment_merchant_name")}
                    className="rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white shadow hover:bg-slate-800 disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Account Type (MCC)
                </label>
                <div className="flex gap-2">
                  <select
                    value={String(formValues["payment_merchant_code"] ?? "8299")}
                    onChange={(e) =>
                      setFormValues((prev) => ({
                        ...prev,
                        payment_merchant_code: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs text-midnight outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="8299">Merchant (8299 - Consultation / Astrology)</option>
                    <option value="8999">Merchant (8999 - Professional Services)</option>
                    <option value="0000">Personal UPI (0000 - No Merchant Tag)</option>
                  </select>
                  <button
                    type="button"
                    disabled={savingKey === "payment_merchant_code"}
                    onClick={() => handleSaveSetting("payment_merchant_code")}
                    className="rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white shadow hover:bg-slate-800 disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 bg-slate-100/70 p-2.5 rounded-xl border border-slate-200">
              💡 <strong>Webhook Callback URL:</strong> <code className="text-sky-700 bg-white px-1.5 py-0.5 rounded border border-slate-200 select-all font-mono">https://astrosettu.netlify.app/api/pay/webhook/gateway</code>
              <br />
              Paste this URL in PhonePe Business / Paytm for Business / Cashfree webhooks, or use a bank SMS/notification webhook forwarder for personal accounts.
            </div>
          </div>
        </div>

        {/* 1. Automated Lead Distribution */}
        <div className="rounded-2xl border border-gold/25 bg-white/95 p-6 shadow-xs backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-midnight">
                Automated Lead Distribution Engine
              </h3>
              <p className="text-xs text-muted mt-0.5">
                When enabled, platform-generated leads are automatically routed to eligible astrologers using the configured routing strategy.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={Boolean(formValues["lead_auto_distribution_enabled"])}
                onChange={(e) =>
                  setFormValues((prev) => ({
                    ...prev,
                    lead_auto_distribution_enabled: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-gold/40 text-gold focus:ring-gold"
              />
              <button
                type="button"
                disabled={savingKey === "lead_auto_distribution_enabled"}
                onClick={() => handleSaveSetting("lead_auto_distribution_enabled")}
                className="rounded-xl bg-gradient-to-r from-gold to-gold-deep px-4 py-2 text-xs font-semibold text-midnight shadow-md hover:brightness-110 disabled:opacity-40 transition-all cursor-pointer"
              >
                {savingKey === "lead_auto_distribution_enabled" ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>

        {/* 2. Maximum Open Leads Per Consultant */}
        <div className="rounded-2xl border border-gold/25 bg-white/95 p-6 shadow-xs backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-midnight">
                Maximum Open Leads Per Consultant
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Cap on concurrent open leads an astrologer/consultant may hold before being skipped in automated distribution.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={100}
                value={Number(formValues["max_open_leads_per_consultant"] ?? 25)}
                onChange={(e) =>
                  setFormValues((prev) => ({
                    ...prev,
                    max_open_leads_per_consultant: Number(e.target.value),
                  }))
                }
                className="w-24 rounded-xl border border-gold/30 bg-parchment/30 p-2 text-xs text-midnight outline-none focus:border-gold focus:ring-1 focus:ring-gold"
              />
              <button
                type="button"
                disabled={savingKey === "max_open_leads_per_consultant"}
                onClick={() => handleSaveSetting("max_open_leads_per_consultant")}
                className="rounded-xl bg-gradient-to-r from-gold to-gold-deep px-4 py-2 text-xs font-semibold text-midnight shadow-md hover:brightness-110 disabled:opacity-40 transition-all cursor-pointer"
              >
                {savingKey === "max_open_leads_per_consultant" ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>

        {/* 3. Direct Lead Routing Policy */}
        <div className="rounded-2xl border border-gold/25 bg-white/95 p-6 shadow-xs backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-midnight">
                Direct Lead Routing Policy
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Determine whether direct customer inquiries to a specific listing route immediately or require manual owner clearance.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={String(formValues["direct_lead_routing_policy"] ?? "immediate_route").replace(/"/g, "")}
                onChange={(e) =>
                  setFormValues((prev) => ({
                    ...prev,
                    direct_lead_routing_policy: e.target.value,
                  }))
                }
                className="rounded-xl border border-gold/30 bg-parchment/30 p-2 text-xs text-midnight outline-none focus:border-gold focus:ring-1 focus:ring-gold"
              >
                <option value="immediate_route">Immediate Route (Prompt customer contact)</option>
                <option value="require_moderation">Central Moderation First (Hold in queue)</option>
              </select>
              <button
                type="button"
                disabled={savingKey === "direct_lead_routing_policy"}
                onClick={() => handleSaveSetting("direct_lead_routing_policy")}
                className="rounded-xl bg-gradient-to-r from-gold to-gold-deep px-4 py-2 text-xs font-semibold text-midnight shadow-md hover:brightness-110 disabled:opacity-40 transition-all cursor-pointer"
              >
                {savingKey === "direct_lead_routing_policy" ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
