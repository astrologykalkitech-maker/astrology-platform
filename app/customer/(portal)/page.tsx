import React from "react";
import Link from "next/link";
import { getCustomerDashboardData } from "@/app/actions/customer";
import styles from "./customer.module.css";

export const dynamic = "force-dynamic";

export default async function CustomerDashboard() {
  const result = await getCustomerDashboardData();

  if (!result.success || !result.data) {
    return (
      <div className={styles.card} style={{ padding: "30px", textAlign: "center" }}>
        <h2 style={{ color: "#b91c1c", marginBottom: "10px" }}>Unable to load dashboard</h2>
        <p style={{ color: "#666", marginBottom: "20px" }}>
          {result.error || "An error occurred while loading your profile data."}
        </p>
        <Link href="/customer" className={styles.btnGold}>
          Retry
        </Link>
      </div>
    );
  }

  const { profile, stats, recentEnquiries } = result.data;

  return (
    <>
      <section className={styles.hero}>
        <h1>
          Welcome back,<br />
          {profile.fullName}
        </h1>
        <p>Find clarity and guidance for your life decisions with the wisdom of Vedic Astrology.</p>
      </section>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: "#f3e8ff", color: "#9333ea" }}>
            <i className="fa-solid fa-list"></i>
          </div>
          <div className={styles.statInfo}>
            <small>Total Enquiries</small>
            <strong>{String(stats.totalEnquiries).padStart(2, "0")}</strong>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: "#ffedd5", color: "#ea580c" }}>
            <i className="fa-solid fa-clock"></i>
          </div>
          <div className={styles.statInfo}>
            <small>Pending</small>
            <strong>{String(stats.pendingEnquiries).padStart(2, "0")}</strong>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: "#dbeafe", color: "#2563eb" }}>
            <i className="fa-solid fa-spinner"></i>
          </div>
          <div className={styles.statInfo}>
            <small>Assigned</small>
            <strong>{String(stats.assignedEnquiries).padStart(2, "0")}</strong>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: "#dcfce7", color: "#16a34a" }}>
            <i className="fa-solid fa-check"></i>
          </div>
          <div className={styles.statInfo}>
            <small>Completed</small>
            <strong>{String(stats.completedEnquiries).padStart(2, "0")}</strong>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "20px" }}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3>Recent Enquiries</h3>
            <Link
              href="/customer/enquiries"
              style={{ fontSize: "12px", color: "var(--gold)", textDecoration: "none", fontWeight: 600 }}
            >
              View All
            </Link>
          </div>

          {recentEnquiries.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)" }}>
              <i className="fa-regular fa-clipboard" style={{ fontSize: "32px", marginBottom: "12px", display: "block", color: "var(--gold)" }}></i>
              <p style={{ margin: "0 0 15px 0", fontWeight: 500 }}>No enquiries submitted yet.</p>
              <Link href="/customer/enquiries/new" className={styles.btnGold}>
                <i className="fa-solid fa-plus"></i> Submit First Enquiry
              </Link>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Astrologer</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEnquiries.map((enq) => {
                    const statusClass =
                      enq.status === "new"
                        ? styles["badge-pending"]
                        : enq.status === "assigned"
                        ? styles["badge-assigned"]
                        : styles["badge-completed"];

                    const displayDate = new Date(enq.created_at).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    });

                    return (
                      <tr key={enq.id}>
                        <td style={{ fontWeight: 600, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {enq.subject}
                        </td>
                        <td>{enq.astrologer_name || "Platform General"}</td>
                        <td>{displayDate}</td>
                        <td>
                          <span className={`${styles.badge} ${statusClass}`}>
                            {enq.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3>Quick Actions</h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <Link href="/customer/astrologers" className={styles.btnGold} style={{ justifyContent: "center" }}>
              <i className="fa-solid fa-magnifying-glass"></i> Find Astrologers
            </Link>
            <Link
              href="/customer/enquiries/new"
              className={styles.btnGold}
              style={{
                justifyContent: "center",
                background: "#fff",
                color: "var(--gold)",
                border: "1px solid var(--gold)",
              }}
            >
              <i className="fa-solid fa-plus"></i> New Enquiry
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}