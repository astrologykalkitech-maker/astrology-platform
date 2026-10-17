"use client";
import React from 'react';
import styles from '../customer.module.css';

export default function NotificationsPage() {
  return (
    <>
      <h1 style={{ fontSize: '22px', color: '#30213e', marginBottom: '15px' }}>Notifications</h1>
      <div className={styles.panel} style={{ marginBottom: '10px', marginTop: 0 }}>
        <p style={{ margin: 0, fontSize: '13px', fontWeight: 'bold', color: '#30213e' }}>Enquiry Assigned!</p>
        <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#666' }}>Your enquiry ENQ-102 has been assigned to Meera Joshi.</p>
      </div>
    </>
  );
}