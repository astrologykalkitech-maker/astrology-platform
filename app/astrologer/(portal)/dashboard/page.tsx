import type { Metadata } from "next";
import { Card } from "@/components/astrologer/ui/Card";
import { PageHeader } from "@/components/astrologer/ui/PageHeader";
import { requireAstrologerPage } from "@/lib/astrologer/guard";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const account = await requireAstrologerPage();

  return (
    <>
      <PageHeader
        title={`Welcome, ${account.full_name ?? "Astrologer"}`}
        description="Phase 2 is working. The real dashboard arrives in Phase 4."
      />
      <Card className="p-6 text-sm text-muted">
        Signed in with the verified role:{" "}
        <strong className="text-midnight">{account.role}</strong>
      </Card>
    </>
  );
}
