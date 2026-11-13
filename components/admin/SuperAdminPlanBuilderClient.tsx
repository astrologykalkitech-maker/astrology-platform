"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Check, Edit2, Archive, RefreshCw, AlertCircle, Sparkles } from "lucide-react";
import type { PaymentPlanRecord, CreatePlanInput } from "@/lib/financial/types";
import { formatPaiseToInr, rupeesToPaise } from "@/lib/financial/pricing";
import { saveDynamicPlanAction, togglePlanAction } from "@/app/actions/super-admin-financials";

export function SuperAdminPlanBuilderClient({
  initialPlans,
}: {
  initialPlans: PaymentPlanRecord[];
}) {
  const [plans, setPlans] = useState<PaymentPlanRecord[]>(initialPlans);
  const [isEditing, setIsEditing] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [priceRupees, setPriceRupees] = useState("0");
  const [commissionPercent, setCommissionPercent] = useState("10.0");
  const [leadQuota, setLeadQuota] = useState("0");
  const [featureInput, setFeatureInput] = useState("");
  const [features, setFeatures] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [isDefault, setIsDefault] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const openCreateModal = () => {
    setEditingPlanId(null);
    setName("");
    setSlug("");
    setDescription("");
    setPriceRupees("0");
    setCommissionPercent("10.0");
    setLeadQuota("0");
    setFeatures(["Direct customer booking", "Chat consultations"]);
    setIsActive(true);
    setIsDefault(false);
    setErrorMsg(null);
    setIsEditing(true);
  };

  const openEditModal = (plan: PaymentPlanRecord) => {
    setEditingPlanId(plan.id);
    setName(plan.name);
    setSlug(plan.slug);
    setDescription(plan.description || "");
    setPriceRupees(String(plan.price_paise / 100));
    setCommissionPercent(String(plan.commission_percent));
    setLeadQuota(String(plan.lead_quota));
    setFeatures(plan.features || []);
    setIsActive(plan.is_active);
    setIsDefault(plan.is_default);
    setErrorMsg(null);
    setIsEditing(true);
  };

  const handleAddFeature = () => {
    if (!featureInput.trim()) return;
    setFeatures([...features, featureInput.trim()]);
    setFeatureInput("");
  };

  const handleRemoveFeature = (index: number) => {
    setFeatures(features.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setErrorMsg(null);

      const payload: CreatePlanInput = {
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        description: description.trim() || undefined,
        price_paise: rupeesToPaise(parseFloat(priceRupees) || 0),
        currency: "INR",
        billing_cycle: "monthly",
        commission_percent: parseFloat(commissionPercent) || 10,
        lead_quota: parseInt(leadQuota, 10) || 0,
        features,
        is_active: isActive,
        is_default: isDefault,
      };

      const res = await saveDynamicPlanAction(editingPlanId, payload);
      if (res.success && res.data) {
        if (editingPlanId) {
          setPlans(plans.map((p) => (p.id === editingPlanId ? res.data! : p)));
        } else {
          setPlans([res.data, ...plans]);
        }
        setIsEditing(false);
      } else {
        setErrorMsg(res.error || "Failed to save plan.");
      }
    } catch {
      setErrorMsg("Network error saving dynamic plan.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (plan: PaymentPlanRecord) => {
    const updatedStatus = !plan.is_active;
    const res = await togglePlanAction(plan.id, updatedStatus);
    if (res.success) {
      setPlans(
        plans.map((p) => (p.id === plan.id ? { ...p, is_active: updatedStatus } : p))
      );
    } else {
      alert(res.error || "Failed to toggle status.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-midnight">Dynamic Subscription Plans</h2>
          <p className="text-xs text-muted">
            Configure astrologer membership tiers, lead quotas, and commission structures.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-4 py-2 text-xs font-semibold text-midnight shadow hover:opacity-95"
        >
          <Plus className="h-4 w-4" />
          Create New Plan
        </button>
      </div>

      {/* Plans List Table */}
      <div className="rounded-2xl border border-gold/25 bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-gold/15 bg-parchment/40 text-[11px] font-semibold text-midnight">
              <th className="py-3 px-4">Plan Name & Slug</th>
              <th className="py-3 px-4">Monthly Fee</th>
              <th className="py-3 px-4">Commission %</th>
              <th className="py-3 px-4">Lead Quota</th>
              <th className="py-3 px-4">Version</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gold/10 text-ink/80">
            {plans.map((plan) => (
              <tr key={plan.id} className="hover:bg-gold/5 transition-colors">
                <td className="py-3 px-4">
                  <div className="font-bold text-midnight flex items-center gap-1.5">
                    {plan.name}
                    {plan.is_default && (
                      <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[9px] text-gold-deep">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted font-mono">{plan.slug}</div>
                </td>
                <td className="py-3 px-4 font-semibold text-midnight">
                  {formatPaiseToInr(plan.price_paise, false)}
                </td>
                <td className="py-3 px-4 font-semibold text-emerald-700">
                  {plan.commission_percent}%
                </td>
                <td className="py-3 px-4 font-medium text-midnight">
                  {plan.lead_quota} leads / mo
                </td>
                <td className="py-3 px-4 text-muted font-mono">v{plan.version}</td>
                <td className="py-3 px-4 text-center">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      plan.is_active
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-gray-100 text-gray-600 border border-gray-200"
                    }`}
                  >
                    {plan.is_active ? "Active" : "Archived"}
                  </span>
                </td>
                <td className="py-3 px-4 text-right space-x-2">
                  <button
                    onClick={() => openEditModal(plan)}
                    className="inline-flex items-center gap-1 rounded-lg border border-gold/30 bg-gold/10 px-2.5 py-1 text-[11px] font-semibold text-gold-deep hover:bg-gold/20"
                  >
                    <Edit2 className="h-3 w-3" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleToggle(plan)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      plan.is_active
                        ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    }`}
                  >
                    <Archive className="h-3 w-3" />
                    {plan.is_active ? "Archive" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Plan Modal via React Portal to escape .rise-in CSS transform containing block */}
      {isEditing && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-midnight/70 backdrop-blur-sm p-4 overflow-hidden">
          <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-gold/30 bg-white shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-gold/15 bg-parchment/40 px-6 py-4 shrink-0">
              <h3 className="text-base font-bold text-midnight flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-gold-deep" />
                {editingPlanId ? "Edit Subscription Plan" : "Create Subscription Plan"}
              </h3>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700 transition"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="mx-6 mt-4 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800 shrink-0">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-ink">
                    Plan Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!editingPlanId) {
                        setSlug(
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9]/g, "-")
                            .replace(/-+/g, "-")
                        );
                      }
                    }}
                    placeholder="e.g. Professional Plan"
                    className="mt-1 w-full rounded-xl border border-gold/30 p-2.5 focus:border-gold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-ink">
                    Slug Identifier <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingPlanId}
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase())}
                    placeholder="e.g. professional"
                    className="mt-1 w-full rounded-xl border border-gold/30 p-2.5 focus:border-gold focus:outline-none disabled:bg-gray-100"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-ink">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Summary of this plan tier..."
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-gold/30 p-2.5 focus:border-gold focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-ink">
                    Price (INR) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={priceRupees}
                    onChange={(e) => setPriceRupees(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gold/30 p-2.5 focus:border-gold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-ink">
                    Commission (%) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    required
                    value={commissionPercent}
                    onChange={(e) => setCommissionPercent(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gold/30 p-2.5 focus:border-gold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-ink">
                    Lead Quota / mo <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={leadQuota}
                    onChange={(e) => setLeadQuota(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gold/30 p-2.5 focus:border-gold focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-ink">Features List</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    value={featureInput}
                    onChange={(e) => setFeatureInput(e.target.value)}
                    placeholder="e.g. Priority search placement"
                    className="flex-1 rounded-xl border border-gold/30 p-2 focus:border-gold focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddFeature}
                    className="rounded-xl bg-gold/20 px-3 py-2 font-semibold text-gold-deep hover:bg-gold/30"
                  >
                    Add
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {features.map((f, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-lg bg-parchment border border-gold/30 px-2 py-1 text-[11px] text-midnight"
                    >
                      <Check className="h-3 w-3 text-emerald-600" />
                      {f}
                      <button
                        type="button"
                        onClick={() => handleRemoveFeature(i)}
                        className="ml-1 text-red-500 font-bold hover:text-red-700"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-ink">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded text-gold focus:ring-gold"
                  />
                  Is Active (Visible to Astrologers)
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-ink">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="rounded text-gold focus:ring-gold"
                  />
                  Is Default Free Tier
                </label>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-gold/15 sticky bottom-0 bg-white">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="rounded-xl border border-gold/30 px-4 py-2 font-medium text-ink hover:bg-parchment"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-5 py-2 font-bold text-midnight shadow hover:opacity-95 disabled:opacity-50"
                >
                  {saving && <RefreshCw className="h-4 w-4 animate-spin" />}
                  Save Plan
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

