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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/80 backdrop-blur-md p-4 rise-in">
      <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-gold/40 bg-white shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-gold/15 p-6">
          <div>
            <h3 className="font-serif text-lg font-bold text-midnight flex items-center gap-2">
              <Shield className="h-5 w-5 text-gold" />
              Manage Consultant Permissions
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Account: <span className="font-semibold text-midnight">{consultant.full_name ?? "Unnamed"}</span> ({consultant.role})
            </p>
          </div>
          <button
            onClick={onClose}
            type="button"
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-muted hover:bg-gold/10 hover:text-midnight transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <p className="text-xs text-muted">
            Grant or revoke specific operational capabilities. Consultant Admins can only perform actions that are explicitly selected below.
          </p>

          <div className="space-y-2.5">
            {ADMIN_PERMISSIONS.filter((p) => !p.superAdminOnly).map((p) => {
              const isChecked = selectedPerms.includes(p.key);

              return (
                <div
                  key={p.key}
                  onClick={() => togglePerm(p.key)}
                  className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-all ${
                    isChecked
                      ? "border-gold/60 bg-gold/15"
                      : "border-gold/20 bg-parchment/20 hover:bg-gold/10"
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      isChecked
                        ? "border-gold bg-gold text-midnight"
                        : "border-gold/40 bg-white"
                    }`}
                  >
                    {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-midnight">
                        {p.label}
                      </span>
                      <span className="font-mono text-[10px] text-gold-deep">
                        {p.key}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted mt-0.5">
                      {p.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gold/15">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-gold/30 bg-white px-4 py-2 text-xs font-semibold text-midnight hover:bg-gold/10 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-gradient-to-r from-gold to-gold-deep px-5 py-2 text-xs font-semibold text-midnight shadow-md hover:brightness-110 disabled:opacity-40 transition-all cursor-pointer"
            >
              {loading ? "Saving..." : "Save Permissions"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
