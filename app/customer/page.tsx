"use client";
import React from 'react';
import Link from 'next/link';
import styles from './customer.module.css';

export default function CustomerDashboard() {
  return (
    <>
      <section className={styles.hero}>
        <h1>Welcome back,<br/>Dolly Vishwakarma</h1>
        <p>Find clarity and guidance for your life decisions with the wisdom of Vedic Astrology.</p>
      </section>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: '#f3e8ff', color: '#9333ea' }}><i className="fa-solid fa-list"></i></div>
          <div className={styles.statInfo}><small>Total Enquiries</small><strong>03</strong></div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: '#ffedd5', color: '#ea580c' }}><i className="fa-solid fa-clock"></i></div>
          <div className={styles.statInfo}><small>Pending</small><strong>01</strong></div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: '#dbeafe', color: '#2563eb' }}><i className="fa-solid fa-spinner"></i></div>
          <div className={styles.statInfo}><small>Assigned</small><strong>01</strong></div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: '#dcfce7', color: '#16a34a' }}><i className="fa-solid fa-check"></i></div>
          <div className={styles.statInfo}><small>Completed</small><strong>01</strong></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3>Recent Enquiries</h3>
            <Link href="/customer/enquiries" style={{ fontSize: '12px', color: 'var(--gold)', textDecoration: 'none', fontWeight: 600 }}>View All</Link>
          </div>
          <table className={styles.table}>
            <thead>
              <tr><th>ID</th><th>Category</th><th>Date</th><th>Status</th></tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 600 }}>ENQ-103</td>
                <td>Career</td>
                <td>14 Oct 2026</td>
                <td><span className={`${styles.badge} ${styles['badge-pending']}`}>Pending</span></td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>ENQ-102</td>
                <td>Love</td>
                <td>12 Oct 2026</td>
                <td><span className={`${styles.badge} ${styles['badge-assigned']}`}>Assigned</span></td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>ENQ-101</td>
                <td>Health</td>
                <td>09 Oct 2026</td>
                <td><span className={`${styles.badge} ${styles['badge-completed']}`}>Completed</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}><h3>Quick Actions</h3></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Link href="/customer/astrologers" className={styles.btnGold} style={{ justifyContent: 'center' }}>
              <i className="fa-solid fa-magnifying-glass"></i> Find Astrologers
            </Link>
            <Link href="/customer/enquiries/new" className={styles.btnGold} style={{ justifyContent: 'center', background: '#fff', color: 'var(--gold)', border: '1px solid var(--gold)' }}>
              <i className="fa-solid fa-plus"></i> New Enquiry
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}