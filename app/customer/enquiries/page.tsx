"use client";
import React from 'react';
import Link from 'next/link';
import styles from '../customer.module.css';

export default function EnquiriesPage() {
  const enquiries = [
    { id: "ENQ-103", category: "Career", status: "Pending", date: "14 Oct 2026" },
    { id: "ENQ-102", category: "Love", status: "Assigned", date: "12 Oct 2026" },
    { id: "ENQ-101", category: "Health", status: "Completed", date: "09 Oct 2026" },
  ];

  return (
    <>
      <h1 style={{ fontSize: '22px', color: '#30213e', marginBottom: '15px' }}>My Enquiries</h1>
      <Link href="/customer/astrologers" className={styles.primaryButton} style={{ width: '100%', marginBottom: '20px', textDecoration: 'none' }}>
        <i className="fa-solid fa-plus"></i> Create New Enquiry
      </Link>
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>ID</th><th>Category</th><th>Date</th><th>Status</th></tr></thead>
          <tbody>
            {enquiries.map((item) => (
              <tr key={item.id}>
                <td style={{ fontWeight: 'bold', color: '#65418c' }}>{item.id}</td>
                <td>{item.category}</td>
                <td>{item.date}</td>
                <td><span className={`${styles.status} ${styles[item.status.toLowerCase()]}`}>{item.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}