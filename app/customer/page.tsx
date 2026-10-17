"use client";

import React from 'react';
import Link from 'next/link';
import styles from './customer.module.css';

export default function CustomerDashboard() {
  return (
    <>
      <div className={styles.welcome}>
        <p className={styles.eyebrow}>YOUR PERSONAL COSMIC SPACE</p>
        <h1>Welcome, Dolly ✦</h1>
        <p className={styles.muted}>A little clarity can open a world of possibilities.</p>
        <span className={styles.datePill}>☼ Your journey, your pace</span>
      </div>

      <section className={styles.hero}>
        <div className={styles.heroText}>
          <p className={styles.heroEyebrow}>YOUR JOURNEY STARTS HERE</p>
          <h2>Find clarity. <br/>Discover your <em>path.</em></h2>
          <p>Share your questions and take the next step.</p>
          <Link href="/customer/astrologers" className={styles.primaryButton} style={{ textDecoration: 'none' }}>
            Find Astrologers <i className="fa-solid fa-arrow-right"></i>
          </Link>
        </div>
      </section>

      <div className={styles.sectionTitle}>
        <h2>Enquiries at a glance</h2>
        <p>Keep track of your guidance journey.</p>
      </div>

      <div className={styles.stats}>
        <Stat title="Total" value={3} icon="▤" tone="purple" />
        <Stat title="Pending" value={1} icon="◷" tone="orange" />
        <Stat title="Assigned" value={1} icon="✧" tone="blue" />
        <Stat title="Completed" value={1} icon="✓" tone="green" />
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <h2>Recent Enquiries</h2>
          {/* YAHAN FIX KIYA HAI: /customer/chats ko /customer/enquiries kiya hai */}
          <Link href="/customer/enquiries" className={styles.outlineButton} style={{ textDecoration: 'none' }}>
            View All
          </Link>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>ID</th><th>Category</th><th>Status</th></tr></thead>
            <tbody>
              <tr>
                <td>ENQ-103</td>
                <td>Career</td>
                <td><span className={`${styles.status} ${styles.pending}`}>Pending</span></td>
              </tr>
              <tr>
                <td>ENQ-102</td>
                <td>Love</td>
                <td><span className={`${styles.status} ${styles.assigned}`}>Assigned</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Stat({ title, value, icon, tone }: { title: string, value: number, icon: string, tone: string }) {
  const toneClass = { purple: styles.purple, orange: styles.orange, blue: styles.blue, green: styles.green }[tone];
  return (
    <article className={styles.stat}>
      <span className={`${styles.statIcon} ${toneClass}`}>{icon}</span>
      <div>
        <small>{title}</small>
        <strong>{value}</strong>
      </div>
    </article>
  );
}