import React from "react";
import { LifeBuoy } from "lucide-react";
import { requireAdminAccess } from "@/lib/auth/admin-guard";
import AdminSupportDeskClient from "./AdminSupportDeskClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Support Desk & Escalations | Super Admin | JyotishSetu",
  description: "Centralized support management, Gemini AI escalation queue, customer care, and consultant inquiries.",
};

export default async function SuperAdminSupportPage() {
  await requireAdminAccess();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold font-display tracking-tight text-midnight flex items-center gap-2">
          <LifeBuoy className="h-6 w-6 text-gold-deep" />
          Customer & Astrologer Support Desk
        </h1>
        <p className="text-xs text-muted">
          Manage platform support inquiries, AI-assisted escalations, customer consultations, and verified astrologer requests.
        </p>
      </div>

      <AdminSupportDeskClient />
    </div>
  );
}
