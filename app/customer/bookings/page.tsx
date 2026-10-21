"use client";
import React from 'react';
import Link from 'next/link';
import styles from '../customer.module.css';

export default function BookingsPage() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
        <Link href="/customer" style={{ color: '#65418c' }}><i className="fa-solid fa-arrow-left"></i></Link>
        <h1 style={{ fontSize: '22px', color: '#30213e', margin: 0 }}>My Bookings</h1>
      </div>
      <div className={styles.panel}>
        <h3 style={{ margin: '0 0 10px 0', color: '#392747' }}>Aarav Sharma</h3>
        <p style={{ margin: '0 0 5px 0', fontSize: '12px', color: '#666' }}>14 Oct 2026 • 10:00 AM</p>
        <span className={`${styles.status} ${styles.completed}`}>Upcoming</span>
      </div>
    </>
  );
}