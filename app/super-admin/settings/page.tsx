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

    setMessage({ type: "success", text: `Setting '${key}' saved successfully.` });
    loadSettings();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <Sliders className="h-6 w-6 text-gold" />
            Platform Configuration & Settings
          </h1>
          <p className="text-xs text-zinc-500">
            Backed by live database settings. No arbitrary SQL or secret keys are exposed here.
          </p>
        </div>
        <button
          onClick={loadSettings}
          type="button"
          disabled={loading}
          className="inline-flex items-center gap-1.5 self-start rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Reload Settings
        </button>
      </div>

      {message && (
        <div
          className={`flex items-center gap-2 rounded-xl border p-3 text-xs ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Settings Grid */}
      <div className="space-y-4">
        {/* 1. Automated Lead Distribution */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Automated Lead Distribution Engine
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
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
                className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 dark:border-zinc-700"
              />
              <button
                type="button"
                disabled={savingKey === "lead_auto_distribution_enabled"}
                onClick={() => handleSaveSetting("lead_auto_distribution_enabled")}
                className="rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {savingKey === "lead_auto_distribution_enabled" ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>

        {/* 2. Maximum Open Leads Per Consultant */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Maximum Open Leads Per Consultant
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
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
                className="w-24 rounded-xl border border-zinc-200 bg-zinc-50/50 p-2 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <button
                type="button"
                disabled={savingKey === "max_open_leads_per_consultant"}
                onClick={() => handleSaveSetting("max_open_leads_per_consultant")}
                className="rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {savingKey === "max_open_leads_per_consultant" ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>

        {/* 3. Direct Lead Routing Policy */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Direct Lead Routing Policy
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
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
                className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-2 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="immediate_route">Immediate Route (Prompt customer contact)</option>
                <option value="require_moderation">Central Moderation First (Hold in queue)</option>
              </select>
              <button
                type="button"
                disabled={savingKey === "direct_lead_routing_policy"}
                onClick={() => handleSaveSetting("direct_lead_routing_policy")}
                className="rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
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
