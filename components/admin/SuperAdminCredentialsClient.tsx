"use client";

import React, { useState } from "react";
import { Award, CheckCircle2, XCircle, Search, ShieldCheck } from "lucide-react";
import { reviewCredential } from "@/app/actions/super-admin-credentials";

export function SuperAdminCredentialsClient({ initialCredentials }: { initialCredentials: any[] }) {
  const [credentials, setCredentials] = useState(initialCredentials);
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleReview = async (id: string, status: "approved" | "rejected") => {
    setUpdatingId(id);
    try {
      const res = await reviewCredential(id, status);
      if (res.success) {
        setCredentials((prev) =>
          prev.map((c) => (c.id === id ? { ...c, verification_status: status } : c))
        );
      } else {
        alert(res.error || "Failed to update credential status");
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = credentials.filter((c) =>
    (c.title || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.institution || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.astrologer?.display_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="relative w-full md:w-80">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
        <input
          type="text"
          placeholder="Search qualification, institution, or astrologer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 bg-white outline-none focus:border-gold"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gold/30 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-parchment/60 border-b border-gold/20 text-midnight font-bold uppercase tracking-wider text-[10px]">
            <tr>
              <th className="p-3.5">Astrologer</th>
              <th className="p-3.5">Degree / Certification Title</th>
              <th className="p-3.5">Accredited Institution</th>
              <th className="p-3.5">Year</th>
              <th className="p-3.5">Status</th>
              <th className="p-3.5 text-right">Verification Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted">
                  No submitted credentials found.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/60 transition">
                  <td className="p-3.5 font-bold text-midnight">
                    {c.astrologer?.display_name || "Astrologer"}
                  </td>
                  <td className="p-3.5 font-semibold text-slate-800">
                    <ShieldCheck className="h-3.5 w-3.5 inline mr-1 text-gold-deep" />
                    {c.title}
                  </td>
                  <td className="p-3.5 text-muted">{c.institution}</td>
                  <td className="p-3.5 text-muted">{c.year_obtained || "—"}</td>
                  <td className="p-3.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        c.verification_status === "approved"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : c.verification_status === "rejected"
                          ? "bg-rose-50 text-rose-700 border border-rose-200"
                          : "bg-amber-50 text-amber-800 border border-amber-200"
                      }`}
                    >
                      {c.verification_status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {c.verification_status !== "approved" && (
                        <button
                          onClick={() => handleReview(c.id, "approved")}
                          disabled={updatingId === c.id}
                          className="rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          Approve
                        </button>
                      )}
                      {c.verification_status !== "rejected" && (
                        <button
                          onClick={() => handleReview(c.id, "rejected")}
                          disabled={updatingId === c.id}
                          className="rounded-lg bg-rose-50 border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

