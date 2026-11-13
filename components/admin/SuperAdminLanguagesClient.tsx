"use client";

import React, { useState } from "react";
import { Globe, Search, UserCheck } from "lucide-react";
import { updateSuperAdminUserLanguage } from "@/app/actions/super-admin-languages";
import { SUPPORTED_LOCALES, SupportedLocale } from "@/lib/i18n/config";

export function SuperAdminLanguagesClient({ initialPreferences }: { initialPreferences: any[] }) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleUpdate = async (userId: string, newLocale: SupportedLocale) => {
    setUpdatingId(userId);
    try {
      const res = await updateSuperAdminUserLanguage(userId, newLocale);
      if (res.success) {
        setPreferences((prev) =>
          prev.map((p) => (p.user_id === userId ? { ...p, locale: newLocale } : p))
        );
      } else {
        alert(res.error || "Failed to update language");
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = preferences.filter((p) =>
    (p.profile?.email || "").toLowerCase().includes(search.toLowerCase()) ||
    (p.profile?.full_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="relative w-full md:w-80">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
        <input
          type="text"
          placeholder="Search user name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 bg-white outline-none focus:border-gold"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gold/30 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-parchment/60 border-b border-gold/20 text-midnight font-bold uppercase tracking-wider text-[10px]">
            <tr>
              <th className="p-3.5">User Profile</th>
              <th className="p-3.5">Role</th>
              <th className="p-3.5">Active Preferred Locale</th>
              <th className="p-3.5">Last Updated</th>
              <th className="p-3.5 text-right">Change Preference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted">
                  No language preferences found.
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.user_id} className="hover:bg-slate-50/60 transition">
                  <td className="p-3.5">
                    <div className="font-bold text-midnight">{p.profile?.full_name || "User"}</div>
                    <div className="text-[11px] text-muted">{p.profile?.email}</div>
                  </td>
                  <td className="p-3.5 capitalize font-semibold text-slate-600">
                    {p.profile?.role || "customer"}
                  </td>
                  <td className="p-3.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 uppercase">
                      {p.locale}
                    </span>
                  </td>
                  <td className="p-3.5 text-muted">
                    {new Date(p.updated_at).toLocaleDateString()}
                  </td>
                  <td className="p-3.5 text-right">
                    <select
                      value={p.locale}
                      disabled={updatingId === p.user_id}
                      onChange={(e) => handleUpdate(p.user_id, e.target.value as SupportedLocale)}
                      className="rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-xs text-midnight outline-none focus:border-gold"
                    >
                      {SUPPORTED_LOCALES.map((loc) => (
                        <option key={loc.code} value={loc.code}>
                          {loc.name} ({loc.nativeName})
                        </option>
                      ))}
                    </select>
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

