import React from "react";
import Link from "next/link";
import { getCustomerEnquiries } from "@/app/actions/customer";
import styles from "../customer.module.css";

export const dynamic = "force-dynamic";

export default async function EnquiriesPage() {
  const result = await getCustomerEnquiries();

  if (!result.success || !result.data) {
    return (
      <div className={styles.card} style={{ padding: "30px", textAlign: "center" }}>
        <h2 style={{ color: "#b91c1c", marginBottom: "10px" }}>Unable to load enquiries</h2>
        <p style={{ color: "#666", marginBottom: "20px" }}>
          {result.error || "An error occurred while loading your enquiries."}
        </p>
        <Link href="/customer/enquiries" className={styles.btnGold}>
          Retry
        </Link>
      </div>
    );
  }

  const enquiries = result.data;

  return (
    <>
      <div className={styles.cardHeader} style={{ borderBottom: "none", marginBottom: "20px", paddingBottom: 0 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-cinzel)", margin: 0, fontSize: "24px", color: "var(--text-dark)" }}>
            My Enquiries ✦
          </h1>
          <p style={{ margin: "5px 0 0 0", color: "var(--text-muted)", fontSize: "13px" }}>
            Track your consultations and questions with Vedic astrologers.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <Link
          href="/customer/enquiries/new"
          className={styles.btnGold}
          style={{ textDecoration: "none" }}
        >
          <i className="fa-solid fa-plus"></i> Submit New Enquiry
        </Link>
      </div>

      {enquiries.length === 0 ? (
        <div className={styles.card} style={{ padding: "50px 20px", textAlign: "center", color: "var(--text-muted)" }}>
          <i className="fa-regular fa-clipboard" style={{ fontSize: "36px", marginBottom: "15px", display: "block", color: "var(--gold)" }}></i>
          <h3 style={{ margin: "0 0 8px 0", color: "var(--text-dark)", fontSize: "18px" }}>No enquiries found</h3>
          <p style={{ margin: "0 0 20px 0", fontSize: "14px" }}>You have not submitted any questions or consultation requests yet.</p>
          <Link href="/customer/enquiries/new" className={styles.btnGold}>
            <i className="fa-solid fa-plus"></i> Submit Your First Enquiry
          </Link>
        </div>
      ) : (
        <div className={styles.card} style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Message Preview</th>
                  <th>Astrologer</th>
                  <th>Submitted Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {enquiries.map((item) => {
                  const statusClass =
                    item.status === "new"
                      ? styles["badge-pending"]
                      : item.status === "assigned"
                      ? styles["badge-assigned"]
                      : styles["badge-completed"];

                  const displayDate = new Date(item.created_at).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600, color: "var(--text-dark)", minWidth: "150px" }}>
                        {item.subject}
                      </td>
                      <td style={{ color: "var(--text-muted)", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.message}
                      </td>
                      <td>{item.astrologer_name || "Platform General"}</td>
                      <td style={{ fontSize: "12px", color: "#666" }}>{displayDate}</td>
                      <td>
                        <span className={`${styles.badge} ${statusClass}`}>
                          {item.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}