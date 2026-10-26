import { User, Shield, KeyRound } from "lucide-react";
import { requireConsultantAdminPage } from "@/lib/auth/admin-guard";

export default async function ConsultantProfilePage() {
  const { profile, permissions, user } = await requireConsultantAdminPage();

  return (
    <div className="space-y-6 max-w-2xl rise-in">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-r from-midnight via-plum to-midnight p-6 text-white shadow-xl">
        <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-gold/10 blur-2xl pointer-events-none" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/15 px-3 py-0.5 text-[11px] font-semibold text-champagne backdrop-blur-sm mb-2">
            <User className="h-3.5 w-3.5 text-gold" />
            <span>Consultant Identity</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-ivory">
            My Consultant Account Profile
          </h1>
          <p className="text-xs text-parchment/80 mt-1">
            Account credentials, role designation, and assigned operational authorizations.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-gold/25 bg-white/95 p-6 shadow-sm backdrop-blur-sm dark:bg-midnight/70 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
          <div>
            <span className="font-serif font-bold text-gold-deep dark:text-champagne uppercase tracking-wider text-[10px] block mb-1">
              Full Name
            </span>
            <span className="font-semibold text-midnight dark:text-ivory text-sm">
              {profile.full_name ?? "Unnamed Consultant"}
            </span>
          </div>

          <div>
            <span className="font-serif font-bold text-gold-deep dark:text-champagne uppercase tracking-wider text-[10px] block mb-1">
              Email Address
            </span>
            <span className="font-semibold text-midnight dark:text-ivory text-sm font-mono">
              {user.email ?? "No email"}
            </span>
          </div>

          <div>
            <span className="font-serif font-bold text-gold-deep dark:text-champagne uppercase tracking-wider text-[10px] block mb-1">
              System Role
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-xs font-bold text-teal-800 dark:text-teal-300 uppercase">
              <Shield className="h-3 w-3" />
              {profile.role.replace("_", " ")}
            </span>
          </div>

          <div>
            <span className="font-serif font-bold text-gold-deep dark:text-champagne uppercase tracking-wider text-[10px] block mb-1">
              Account Created
            </span>
            <span className="text-muted-foreground font-mono">
              {new Date(profile.created_at).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gold/25 bg-white/95 p-6 shadow-sm backdrop-blur-sm dark:bg-midnight/70">
        <h3 className="text-sm font-semibold text-midnight dark:text-ivory flex items-center gap-2 border-b border-gold/15 pb-3">
          <KeyRound className="h-4 w-4 text-gold" />
          Explicitly Granted Permissions
        </h3>
        <p className="text-xs text-muted-foreground mt-2.5">
          Consultant Admins are not permitted to alter their own role or grant permissions to themselves. Any change must be issued by the platform owner.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {permissions.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">
              No elevated administrative permissions assigned. Lead operations access only.
            </span>
          ) : (
            permissions.map((p) => (
              <span
                key={p}
                className="rounded-lg border border-gold/30 bg-parchment/40 px-2.5 py-1 font-mono text-xs font-semibold text-midnight dark:bg-plum/40 dark:text-champagne"
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

