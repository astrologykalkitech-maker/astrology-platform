"use client";

import { useState, useEffect } from "react";
import { X, Shield, AlertCircle, Check } from "lucide-react";
import { updateConsultantPermissions } from "@/app/actions/admin-consultants";
import { ADMIN_PERMISSIONS } from "@/lib/auth/permissions";
import type { AdminPermissionKey } from "@/lib/types/database.types";
import type { ConsultantWithPermissions } from "@/app/actions/admin-consultants";

interface ConsultantPermissionsModalProps {
  consultant: ConsultantWithPermissions | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ConsultantPermissionsModal({
  consultant,
  isOpen,
  onClose,
  onSuccess,
}: ConsultantPermissionsModalProps) {
  const [selectedPerms, setSelectedPerms] = useState<AdminPermissionKey[]>(
    consultant?.permissions ?? []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (consultant) {
      setSelectedPerms(consultant.permissions ?? []);
      setError(null);
    }
  }, [consultant, isOpen]);

  if (!isOpen || !consultant) return null;

  const togglePerm = (perm: AdminPermissionKey) => {
    setSelectedPerms((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await updateConsultantPermissions({
      userId: consultant.id,
      permissions: selectedPerms,
    });

    setLoading(false);

    if (!res.success) {
      setError(res.error);
      return;
    }

    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-100 p-6 dark:border-zinc-800">
          <div>
            <h3 className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Shield className="h-5 w-5 text-gold" />
              Manage Consultant Permissions
            </h3>
            <p className="text-xs text-zinc-500">
              Account: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{consultant.full_name ?? "Unnamed"}</span> ({consultant.role})
            </p>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <p className="text-xs text-zinc-500">
            Grant or revoke specific operational capabilities. Consultant Admins can only perform actions that are explicitly selected below.
          </p>

          <div className="space-y-2">
            {ADMIN_PERMISSIONS.filter((p) => !p.superAdminOnly).map((p) => {
              const isChecked = selectedPerms.includes(p.key);

              return (
                <div
                  key={p.key}
                  onClick={() => togglePerm(p.key)}
                  className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-all ${
                    isChecked
                      ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800/40"
                      : "border-zinc-200 hover:bg-zinc-50/50 dark:border-zinc-800 dark:hover:bg-zinc-900/40"
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      isChecked
                        ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                        : "border-zinc-300 dark:border-zinc-700"
                    }`}
                  >
                    {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                        {p.label}
                      </span>
                      <span className="font-mono text-[10px] text-zinc-400">
                        {p.key}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      {p.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {loading ? "Saving..." : "Save Permissions"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
