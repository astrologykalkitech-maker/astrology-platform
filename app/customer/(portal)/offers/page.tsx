import React from "react";
import Link from "next/link";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import styles from "../customer.module.css";

export const dynamic = "force-dynamic";

export default async function OffersPage() {
  await requireCustomerPage();

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "15px" }}>
        <Link href="/customer" style={{ color: "var(--gold)" }}>
          <i className="fa-solid fa-arrow-left"></i>
        </Link>
        <h1 style={{ fontSize: "22px", color: "var(--text-dark)", margin: 0, fontFamily: "var(--font-cinzel)" }}>
          Platform Promotions ✦
        </h1>
      </div>

      <div className={styles.hero} style={{ marginTop: 0 }}>
        <div>
          <p style={{ color: "var(--gold)", fontSize: "12px", letterSpacing: "1px", margin: "0 0 5px 0", fontWeight: 600 }}>
            COMMUNITY ANNOUNCEMENT
          </p>
          <h2>Introductory Guidance Consultations</h2>
          <p>
            Browse verified astrologers and request personalized guidance via platform enquiries.
          </p>
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: "20px" }}>
        <h3 style={{ margin: "0 0 10px 0", color: "var(--text-dark)", fontSize: "16px" }}>
          Referral & Rewards Notice
        </h3>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "0 0 20px 0", lineHeight: 1.6 }}>
          Automated coupon redemption and referral wallet rewards are currently in preview. Formal ledger redemption will become available with upcoming payment and billing integration.
        </p>
        <Link href="/customer/astrologers" className={styles.btnGold}>
          <i className="fa-solid fa-user-astronaut"></i> Browse Verified Astrologers
        </Link>
      </div>
    </>
  );
}