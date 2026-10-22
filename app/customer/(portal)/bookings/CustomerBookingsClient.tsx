"use client";

import React, { useSyncExternalStore, useState } from "react";
import Link from "next/link";
import {
  CUSTOMER_BOOKINGS_STORAGE_KEY,
  isCustomerDemoBooking,
  type CustomerDemoBooking,
} from "@/lib/customer-demo";
import styles from "../customer.module.css";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getStoredBookingsSnapshot(): CustomerDemoBooking[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(CUSTOMER_BOOKINGS_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.every(isCustomerDemoBooking)) {
      return parsed;
    }
  } catch {
    // Ignore corrupt store
  }
  return [];
}

const SERVER_SNAPSHOT: CustomerDemoBooking[] = [];

export default function CustomerBookingsClient() {
  const storeBookings = useSyncExternalStore(
    subscribe,
    getStoredBookingsSnapshot,
    () => SERVER_SNAPSHOT
  );

  const [localBookings, setLocalBookings] = useState<CustomerDemoBooking[] | null>(null);

  const bookings = localBookings ?? storeBookings;

  function handleCancelBooking(id: string) {
    const updated = bookings.filter((b) => b.id !== id);
    setLocalBookings(updated);
    try {
      localStorage.setItem(CUSTOMER_BOOKINGS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Fallback
    }
  }

  if (bookings.length === 0) {
    return (
      <div className={styles.card} style={{ padding: "50px 20px", textAlign: "center" }}>
        <i
          className="fa-regular fa-calendar-xmark"
          style={{ fontSize: "36px", marginBottom: "15px", display: "block", color: "var(--gold)" }}
        ></i>
        <h3 style={{ margin: "0 0 10px 0", color: "var(--text-dark)", fontSize: "18px" }}>
          No Active Bookings
        </h3>
        <p style={{ margin: "0 auto 20px auto", color: "var(--text-muted)", fontSize: "14px", maxWidth: "480px" }}>
          You do not have any scheduled consultations. Choose a verified astrologer from our directory or submit a direct enquiry.
        </p>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/customer/astrologers" className={styles.btnGold}>
            <i className="fa-solid fa-user-astronaut"></i> Browse Astrologers
          </Link>
          <Link
            href="/customer/enquiries/new"
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              color: "var(--text-dark)",
              background: "#fff",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <i className="fa-solid fa-paper-plane"></i> Ask the Platform
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card} style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Booking ID</th>
              <th>Astrologer</th>
              <th>Service</th>
              <th>Mode</th>
              <th>Date & Time</th>
              <th>Fee</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td style={{ fontWeight: 600, color: "var(--text-dark)", fontSize: "12px" }}>
                  {b.id}
                </td>
                <td style={{ fontWeight: 600, color: "var(--text-dark)" }}>{b.astrologer}</td>
                <td style={{ color: "var(--text-muted)" }}>{b.service}</td>
                <td>
                  <span
                    style={{
                      background: "#f1f5f9",
                      padding: "3px 8px",
                      borderRadius: "6px",
                      fontSize: "11px",
                      fontWeight: 600,
                    }}
                  >
                    {b.consultation}
                  </span>
                </td>
                <td style={{ fontSize: "12px", color: "var(--text-dark)", whiteSpace: "nowrap" }}>
                  {b.date} at {b.time}
                </td>
                <td style={{ fontWeight: 700, color: "var(--text-dark)" }}>₹{b.price}</td>
                <td>
                  <span
                    className={`${styles.badge} ${
                      b.status === "Upcoming" ? styles["badge-assigned"] : styles["badge-completed"]
                    }`}
                  >
                    {b.status}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => handleCancelBooking(b.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#dc2626",
                      fontSize: "12px",
                      cursor: "pointer",
                      padding: "4px 8px",
                      borderRadius: "4px",
                    }}
                    title="Cancel consultation reservation"
                  >
                    Cancel
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
