"use client";

import React, { useState } from "react";
import { Sparkles, Plus, Edit2, CheckCircle2, XCircle, Search, RefreshCw, AlertCircle } from "lucide-react";
import { upsertSuperAdminPuja, togglePujaStatus } from "@/app/actions/super-admin-pujas";

export function SuperAdminPujasClient({ initialPujas }: { initialPujas: any[] }) {
  const [pujas, setPujas] = useState(initialPujas);
  const [search, setSearch] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editingPuja, setEditingPuja] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [significance, setSignificance] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [basePrice, setBasePrice] = useState(2100);
  const [category, setCategory] = useState("Vedic");
  const [isActive, setIsActive] = useState(true);

  const handleOpenAdd = () => {
    setEditingPuja(null);
    setName("");
    setDescription("");
    setSignificance("");
    setDurationMinutes(60);
    setBasePrice(2100);
    setCategory("Vedic");
    setIsActive(true);
    setIsEditing(true);
    setError(null);
  };

  const handleOpenEdit = (p: any) => {
    setEditingPuja(p);
    setName(p.title || p.name || "");
    setDescription(p.description || "");
    setSignificance(p.benefits || p.significance || "");
    setDurationMinutes(p.duration_minutes || 60);
    setBasePrice(p.base_price || 2100);
    setCategory(p.category || "Vedic");
    setIsActive(p.is_active);
    setIsEditing(true);
    setError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await upsertSuperAdminPuja({
        id: editingPuja?.id,
        title: name,
        description,
        benefits: significance,
        duration_minutes: durationMinutes,
        base_price: basePrice,
        category,
        is_active: isActive,
      });

      if (!res.success || !res.puja) {
        throw new Error(res.error || "Failed to save Puja item.");
      }

      if (editingPuja) {
        setPujas((prev) => prev.map((item) => (item.id === editingPuja.id ? res.puja : item)));
      } else {
        setPujas((prev) => [res.puja, ...prev]);
      }
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id: string, currentStatus: boolean) => {
    try {
      await togglePujaStatus(id, !currentStatus);
      setPujas((prev) =>
        prev.map((item) => (item.id === id ? { ...item, is_active: !currentStatus } : item))
      );
    } catch (err: any) {
      alert(err.message);
    }
  };

  const filtered = pujas.filter((p) => {
    const title = (p.title || p.name || "").toLowerCase();
    const cat = (p.category || "").toLowerCase();
    const q = search.toLowerCase();
    return title.includes(q) || cat.includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <input
            type="text"
            placeholder="Search Puja rituals or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 bg-white outline-none focus:border-gold"
          />
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-4 py-2 text-xs font-bold text-midnight shadow hover:opacity-95"
        >
          <Plus className="h-4 w-4" /> Add New Puja Ritual
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gold/30 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-parchment/60 border-b border-gold/20 text-midnight font-bold uppercase tracking-wider text-[10px]">
            <tr>
              <th className="p-3.5">Puja Name</th>
              <th className="p-3.5">Category</th>
              <th className="p-3.5">Dakshina / Price</th>
              <th className="p-3.5">Duration</th>
              <th className="p-3.5">Status</th>
              <th className="p-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted">
                  No Puja rituals found.
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/60 transition">
                  <td className="p-3.5">
                    <div className="font-bold text-midnight">{p.title || p.name}</div>
                    <div className="text-[11px] text-muted line-clamp-1">{p.benefits || p.significance || p.description}</div>
                  </td>
                  <td className="p-3.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                      {p.category || "Vedic"}
                    </span>
                  </td>
                  <td className="p-3.5 font-bold text-midnight">₹{p.base_price}</td>
                  <td className="p-3.5 text-muted">{p.duration_minutes} mins</td>
                  <td className="p-3.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        p.is_active
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {p.is_active ? "Active" : "Archived"}
                    </span>
                  </td>
                  <td className="p-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleToggle(p.id, p.is_active)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                          p.is_active
                            ? "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
                            : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                        }`}
                      >
                        {p.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => handleOpenEdit(p)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Edit2 className="h-3.5 w-3.5 inline mr-1" /> Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit / Create Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight/70 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-lg rounded-2xl border border-gold/30 bg-white shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gold/15 pb-3">
              <h3 className="font-bold text-sm text-midnight">
                {editingPuja ? "Edit Puja Ritual" : "Create New Puja Ritual"}
              </h3>
              <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-800 rounded-xl border border-red-200 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Puja Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 outline-none focus:border-gold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Dakshina / Price (INR) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={basePrice}
                    onChange={(e) => setBasePrice(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl border border-slate-300 outline-none focus:border-gold"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Duration (Minutes)</label>
                  <input
                    type="number"
                    required
                    min={15}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl border border-slate-300 outline-none focus:border-gold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Category</label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 outline-none focus:border-gold"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Vedic Significance / Purpose</label>
                <textarea
                  rows={2}
                  value={significance}
                  onChange={(e) => setSignificance(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 outline-none focus:border-gold"
                />
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer font-semibold">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded text-gold focus:ring-gold"
                  />
                  Active (Visible in Seeker Catalogue)
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 border rounded-xl hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-midnight text-white font-bold rounded-xl hover:bg-slate-800 disabled:opacity-50"
                  >
                    {loading ? "Saving..." : "Save Puja"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

