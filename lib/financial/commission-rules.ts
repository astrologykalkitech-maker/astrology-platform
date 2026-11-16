export interface CommissionRateWindow {
  effective_from: string;
  effective_until?: string | null;
  is_active: boolean;
}

export function isCommissionSettingEffective(
  setting: CommissionRateWindow,
  at: Date = new Date()
): boolean {
  if (!setting.is_active) return false;

  const startsAt = Date.parse(setting.effective_from);
  const endsAt = setting.effective_until ? Date.parse(setting.effective_until) : null;
  const currentTime = at.getTime();

  return (
    Number.isFinite(startsAt) &&
    startsAt <= currentTime &&
    (endsAt === null || (Number.isFinite(endsAt) && endsAt > currentTime))
  );
}
