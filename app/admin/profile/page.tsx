import { User, Shield, KeyRound } from "lucide-react";
import { requireConsultantAdminPage } from "@/lib/auth/admin-guard";

export default async function ConsultantProfilePage() {
  const { profile, permissions, user } = await requireConsultantAdminPage();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
          <User className="h-6 w-6 text-gold" />
          My Consultant Account Profile
        </h1>
        <p className="text-xs text-zinc-500">
          Account credentials, role designation, and assigned operational authorizations.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[10px] block">
              Full Name
            </span>
            <span className="font-medium text-zinc-900 dark:text-zinc-100 text-sm">
              {profile.full_name ?? "Unnamed Consultant"}
            </span>
          </div>

          <div>
            <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[10px] block">
              Email Address
            </span>
            <span className="font-medium text-zinc-900 dark:text-zinc-100 text-sm">
              {user.email ?? "No email"}
            </span>
          </div>

          <div>
            <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[10px] block">
              System Role
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-900 mt-0.5 dark:bg-teal-950 dark:text-teal-200">
              <Shield className="h-3 w-3" />
              {profile.role.replace("_", " ")}
            </span>
          </div>

          <div>
            <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[10px] block">
              Account Created
            </span>
            <span className="text-zinc-700 dark:text-zinc-300 font-mono">
              {new Date(profile.created_at).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 border-b border-zinc-100 pb-3 dark:border-zinc-800">
          <KeyRound className="h-4 w-4 text-gold" />
          Explicitly Granted Permissions
        </h3>
        <p className="text-xs text-zinc-500 mt-2">
          Consultant Admins are not permitted to alter their own role or grant permissions to themselves. Any change must be issued by the platform owner.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {permissions.length === 0 ? (
            <span className="text-xs text-zinc-400 italic">
              No elevated administrative permissions assigned. Lead operations access only.
            </span>
          ) : (
            permissions.map((p) => (
              <span
                key={p}
                className="rounded-lg bg-zinc-100 border border-zinc-200 px-2.5 py-1 font-mono text-xs text-zinc-800 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
              >
                {p}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
