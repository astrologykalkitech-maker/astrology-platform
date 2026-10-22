import React from "react";
import Link from "next/link";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import CustomerBookingsClient from "./CustomerBookingsClient";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  await requireCustomerPage();

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "15px" }}>
        <Link href="/customer" style={{ color: "var(--gold)" }}>
          <i className="fa-solid fa-arrow-left"></i>
        </Link>
        <h1 style={{ fontSize: "22px", color: "var(--text-dark)", margin: 0, fontFamily: "var(--font-cinzel)" }}>
          My Bookings ✦
        </h1>
      </div>

      <CustomerBookingsClient />
    </>
  );
}