import React from "react";
import Link from "next/link";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { getCustomerEnquiries } from "@/app/actions/customer";
import styles from "../customer.module.css";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  await requireCustomerPage();
  const res = await getCustomerEnquiries();
  const enquiries = res.success && res.data ? res.data : [];

  // Derive notifications from customer enquiries
  const recentUpdates = enquiries.filter(
    (e) => e.status === "assigned" || e.status === "closed" || e.status === "new"
  );

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "15px" }}>
        <Link href="/customer" style={{ color: "var(--gold)" }}>
          <i className="fa-solid fa-arrow-left"></i>
        </Link>
        <h1 style={{ fontSize: "22px", color: "var(--text-dark)", margin: 0, fontFamily: "var(--font-cinzel)" }}>
          Notifications ✦
        </h1>
      </div>

      {recentUpdates.length === 0 ? (
        <div className={styles.card} style={{ padding: "40px 20px", textAlign: "center" }}>
          <i
            className="fa-regular fa-bell-slash"
            style={{ fontSize: "36px", marginBottom: "15px", display: "block", color: "var(--gold)" }}
          ></i>
          <h3 style={{ margin: "0 0 10px 0", color: "var(--text-dark)", fontSize: "18px" }}>
            All Caught Up
          </h3>
          <p style={{ margin: "0 auto 20px auto", color: "var(--text-muted)", fontSize: "14px", maxWidth: "480px" }}>
            You have no new notifications. You will receive updates here when an astrologer replies or your enquiry status changes.
          </p>
          <Link href="/customer/enquiries" className={styles.btnGold}>
            <i className="fa-solid fa-clipboard-list"></i> View My Enquiries
          </Link>
        </div>
      ) : (
        <div className={styles.card} style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
            <h3 style={{ margin: 0, fontSize: "15px", color: "var(--text-dark)" }}>Recent Activity & Updates</h3>
          </div>
          <div>
            {recentUpdates.slice(0, 10).map((item) => {
              const displayDate = new Date(item.created_at).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              });

              const isClosed = item.status === "closed";
              const isAssigned = item.status === "assigned";

              return (
                <div
                  key={item.id}
                  style={{
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "15px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      background: isAssigned ? "#dbeafe" : isClosed ? "#dcfce7" : "#fef3c7",
                      color: isAssigned ? "#2563eb" : isClosed ? "#16a34a" : "#d97706",
                      fontSize: "14px",
                      flexShrink: 0,
                    }}
                  >
                    <i
                      className={
                        isClosed
                          ? "fa-solid fa-check"
                          : isAssigned
                          ? "fa-solid fa-user-check"
                          : "fa-regular fa-paper-plane"
                      }
                    ></i>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "4px" }}>
                      <strong style={{ fontSize: "14px", color: "var(--text-dark)" }}>
                        {isAssigned
                          ? "Enquiry Assigned to Astrologer"
                          : isClosed
                          ? "Consultation Completed"
                          : "Enquiry Submitted"}
                      </strong>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{displayDate}</span>
                    </div>
                    <p style={{ margin: "0 0 6px 0", fontSize: "13px", color: "var(--text-muted)" }}>
                      {item.subject} &bull; {item.astrologer_name || "Platform Guidance"}
                    </p>
                    <Link
                      href="/customer/enquiries"
                      style={{ fontSize: "12px", color: "var(--gold)", textDecoration: "none", fontWeight: 600 }}
                    >
                      View in Enquiries &rarr;
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}