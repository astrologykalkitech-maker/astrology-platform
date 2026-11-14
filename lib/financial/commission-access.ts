import type { UserRole } from "../types/database.types";

export function canAccessCommissionStatement(
  role: UserRole,
  callerConsultantId: string | null,
  targetConsultantId: string
): boolean {
  if (role === "super_admin" || role === "admin") {
    return true;
  }

  return role === "astrologer" && callerConsultantId === targetConsultantId;
}
