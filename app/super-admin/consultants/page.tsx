"use client";

import { useEffect, useState } from "react";
import { UserCog, Shield, KeyRound, RefreshCw, UserPlus, X, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  getConsultantAdmins,
  inviteConsultantAdmin,
  type ConsultantWithPermissions,
} from "@/app/actions/admin-consultants";
import { ConsultantPermissionsModal } from "@/components/admin/ConsultantPermissionsModal";

export default function SuperAdminConsultantsPage() {
  const [consultants, setConsultants] = useState<ConsultantWithPermissions[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedConsultant, setSelectedConsultant] =
    useState<ConsultantWithPermissions | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Invite Modal State
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
      text: `Consultant invitation sent to ${inviteEmail} successfully!`,
    });
    setInviteEmail("");
    setInviteFullName("");
    loadConsultants();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <UserCog className="h-6 w-6 text-gold" />
            Consultant Accounts & Permissions
          </h1>
          <p className="text-xs text-zinc-500">
            Enforce granular operational access and least-privilege boundaries for consultant admins.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setInviteMessage(null);
              setIsInviteModalOpen(true);
            }}
            type="button"
            className="inline-flex items-center gap-1.5 self-start rounded-xl bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Invite Consultant
          </button>
          <button
            onClick={loadConsultants}
            type="button"
            disabled={loading}
            className="inline-flex items-center gap-1.5 self-start rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1">
          Security Policy:
        </h4>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Consultant Admins hold no default platform-wide permissions upon account creation. Every operational capability (such as listing reviews or reassignment requests) must be explicitly granted by the platform owner.
        </p>
      </div>

      {/* Consultants Table */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-100 bg-zinc-50/75 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
              <tr>
                <th className="px-4 py-3">Account Name & ID</th>
                <th className="px-4 py-3">System Role</th>
                <th className="px-4 py-3">Explicitly Granted Permissions</th>
                <th className="px-4 py-3">Created Date</th>
                <th className="px-4 py-3 text-right">Access Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-400">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Loading administrator accounts...
                  </td>
                </tr>
              ) : consultants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-400">
                    No administrator accounts found.
                  </td>
                </tr>
              ) : (
                consultants.map((c) => {
                  const isSuper = c.role === "super_admin" || c.role === "admin";

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {c.full_name ?? "Unnamed Administrator"}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono">
                          {c.id}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            isSuper
                              ? "bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950 dark:text-amber-200"
                              : "bg-teal-100 text-teal-900 border border-teal-300 dark:bg-teal-950 dark:text-teal-200"
                          }`}
                        >
                          <Shield className="h-3 w-3" />
                          {c.role.replace("_", " ")}
                        </span>
                      </td>

                      <td className="px-4 py-3 max-w-sm">
                        {isSuper ? (
                          <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 italic">
                            Full Platform Authority (All Permissions Inherent)
                          </span>
                        ) : c.permissions.length === 0 ? (
                          <span className="text-[11px] text-zinc-400 italic">
                            Zero permissions granted (Restricted)
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {c.permissions.map((p) => (
                              <span
                                key={p}
                                className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-zinc-400 font-mono text-[11px]">
                        {new Date(c.created_at).toLocaleDateString()}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {!isSuper ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedConsultant(c);
                              setIsModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                          >
                            <KeyRound className="h-3 w-3" />
                            Manage Permissions
                          </button>
                        ) : (
                          <span className="text-[11px] text-zinc-400">Owner Level</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-4 dark:border-zinc-800">
              <div>
                <h3 className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-gold" />
                  Invite Consultant Admin
                </h3>
                <p className="text-xs text-zinc-500">
                  Sends an activation invite to join platform operations.
                </p>
              </div>
              <button
                onClick={() => setIsInviteModalOpen(false)}
                type="button"
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {inviteMessage && (
              <div
                className={`mt-4 flex items-center gap-2 rounded-lg border p-3 text-xs ${
                  inviteMessage.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                    : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                }`}
              >
                {inviteMessage.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                <span>{inviteMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleInviteSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={inviteFullName}
                  onChange={(e) => setInviteFullName(e.target.value)}
                  placeholder="e.g. Priya Sharma"
                  className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="consultant@company.com"
                  className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  disabled={inviteLoading}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
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
