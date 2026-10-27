"use client";

import { useEffect, useState } from "react";
import { UserCog, UserPlus, KeyRound, Shield, RefreshCw, X, CheckCircle2, AlertCircle } from "lucide-react";
import { getConsultantAdmins, inviteConsultantAdmin } from "@/app/actions/admin-consultants";
import { ConsultantPermissionsModal } from "@/components/admin/ConsultantPermissionsModal";
import type { ConsultantWithPermissions } from "@/app/actions/admin-consultants";

export default function SuperAdminConsultantsPage() {
  const [consultants, setConsultants] = useState<ConsultantWithPermissions[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedConsultant, setSelectedConsultant] = useState<ConsultantWithPermissions | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadConsultants = async () => {
    setLoading(true);
    const res = await getConsultantAdmins();
    if (res.success) {
      setConsultants(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    let ignore = false;
    async function fetchConsultants() {
      const res = await getConsultantAdmins();
      if (!ignore) {
        if (res.success) {
          setConsultants(res.data);
        }
        setLoading(false);
      }
    }

    fetchConsultants();
    return () => {
      ignore = true;
    };
  }, []);

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteLoading(true);
    setInviteMessage(null);

    const res = await inviteConsultantAdmin({
      email: inviteEmail.trim(),
      fullName: inviteFullName.trim(),
    });

    setInviteLoading(false);

    if (!res.success) {
      setInviteMessage({ type: "error", text: res.error });
      return;
    }

    setInviteMessage({
      type: "success",
      text: `Invitation successfully dispatched to ${inviteEmail}.`,
    });
    setInviteEmail("");
    setInviteFullName("");
    loadConsultants();
  };

  return (
    <div className="space-y-6 rise-in">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-r from-midnight via-plum to-midnight p-6 text-white shadow-xl">
        <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-gold/10 blur-2xl pointer-events-none" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/15 px-3 py-0.5 text-[11px] font-semibold text-champagne backdrop-blur-sm mb-2">
              <UserCog className="h-3.5 w-3.5 text-gold" />
              <span>Role-Based Access Control</span>
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-ivory">
              Consultant Accounts &amp; Permissions
            </h1>
            <p className="text-xs text-parchment/80 mt-1 max-w-xl">
              Enforce granular operational access, least-privilege boundaries, and active permission policies for consultant admins.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <button
              onClick={() => setIsInviteModalOpen(true)}
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-gold to-gold-deep px-4 py-2 text-xs font-semibold text-midnight shadow-md hover:brightness-110 transition-all cursor-pointer"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Invite Consultant
            </button>
            <button
              onClick={loadConsultants}
              type="button"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-gold/30 bg-midnight/80 px-4 py-2 text-xs font-semibold text-champagne shadow-sm hover:bg-gold/20 hover:border-gold transition-all cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-gold" : "text-gold"}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-xs backdrop-blur-sm">
        <h4 className="text-xs font-serif font-bold uppercase tracking-wider text-gold-deep mb-1.5">
          Least Privilege Security Policy:
        </h4>
        <p className="text-xs text-muted leading-relaxed">
          Consultant Admins hold no default platform-wide permissions upon account creation. Every operational capability (such as listing reviews or reassignment requests) must be explicitly granted by the platform owner.
        </p>
      </div>

      {/* Consultants Table */}
      <div className="overflow-hidden rounded-2xl border border-gold/25 bg-white/95 shadow-xs backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-gold/20 bg-parchment/60 text-[11px] font-semibold uppercase tracking-wider text-gold-deep">
              <tr>
                <th className="px-5 py-3">Account Name &amp; ID</th>
                <th className="px-5 py-3">System Role</th>
                <th className="px-5 py-3">Explicitly Granted Permissions</th>
                <th className="px-5 py-3">Created Date</th>
                <th className="px-5 py-3 text-right">Access Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gold/10">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-gold" />
                    Loading administrator accounts...
                  </td>
                </tr>
              ) : consultants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted font-medium">
                    No administrator accounts found.
                  </td>
                </tr>
              ) : (
                consultants.map((c) => {
                  const isSuper = c.role === "super_admin" || c.role === "admin";

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-gold/5 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-midnight text-sm">
                          {c.full_name ?? "Unnamed Administrator"}
                        </div>
                        <div className="text-[10px] text-muted font-mono mt-0.5">
                          {c.id}
                        </div>
                      </td>

                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            isSuper
                              ? "border border-gold/50 bg-gold/15 text-gold-deep"
                              : "border border-teal-500/30 bg-teal-50 text-teal-800"
                          }`}
                        >
                          <Shield className="h-3 w-3" />
                          {c.role.replace("_", " ")}
                        </span>
                      </td>

                      <td className="px-5 py-3.5 max-w-sm">
                        {isSuper ? (
                          <span className="text-[11px] font-medium text-gold-deep italic">
                            Full Platform Authority (All Permissions Inherent)
                          </span>
                        ) : c.permissions.length === 0 ? (
                          <span className="text-[11px] text-muted italic">
                            Zero permissions granted (Restricted)
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {c.permissions.map((p) => (
                              <span
                                key={p}
                                className="rounded-md border border-gold/25 bg-parchment/60 px-2 py-0.5 font-mono text-[10px] text-midnight font-medium"
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-3.5 text-muted font-mono text-[11px]">
                        {new Date(c.created_at).toLocaleDateString()}
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        {!isSuper ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedConsultant(c);
                              setIsModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-gold/30 bg-white px-3 py-1.5 text-[11px] font-semibold text-midnight shadow-2xs hover:bg-gold/15 transition-all cursor-pointer"
                          >
                            <KeyRound className="h-3.5 w-3.5 text-gold-deep" />
                            Manage Permissions
                          </button>
                        ) : (
                          <span className="text-[11px] text-muted font-medium">Owner Level</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConsultantPermissionsModal
        consultant={selectedConsultant}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedConsultant(null);
        }}
        onSuccess={loadConsultants}
      />

      {/* Invite Consultant Modal */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/80 backdrop-blur-md p-4 rise-in">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-gold/40 bg-white p-6 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-gold/15 pb-4">
              <div>
                <h3 className="font-serif text-lg font-bold text-midnight flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-gold" />
                  Invite Consultant Admin
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Sends an activation invite to join platform operations.
                </p>
              </div>
              <button
                onClick={() => setIsInviteModalOpen(false)}
                type="button"
                aria-label="Close dialog"
                className="rounded-lg p-1.5 text-muted hover:bg-gold/10 hover:text-midnight transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {inviteMessage && (
              <div
                className={`mt-4 flex items-center gap-2 rounded-xl border p-3 text-xs font-medium ${
                  inviteMessage.type === "success"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-red-300 bg-red-50 text-red-800"
                }`}
              >
                {inviteMessage.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                )}
                <span>{inviteMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleInviteSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-midnight mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={inviteFullName}
                  onChange={(e) => setInviteFullName(e.target.value)}
                  placeholder="e.g. Priya Sharma"
                  className="w-full rounded-xl border border-gold/30 bg-parchment/30 p-2.5 text-xs text-midnight outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-midnight mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="consultant@company.com"
                  className="w-full rounded-xl border border-gold/30 bg-parchment/30 p-2.5 text-xs text-midnight outline-none focus:border-gold focus:ring-1 focus:ring-gold"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gold/15">
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  disabled={inviteLoading}
                  className="rounded-xl border border-gold/30 bg-white px-4 py-2 text-xs font-semibold text-midnight hover:bg-gold/10 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="rounded-xl bg-gradient-to-r from-gold to-gold-deep px-5 py-2 text-xs font-semibold text-midnight shadow-md hover:brightness-110 disabled:opacity-40 transition-all cursor-pointer"
                >
                  {inviteLoading ? "Sending..." : "Send Invitation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
