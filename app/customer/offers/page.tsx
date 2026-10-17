"use client";
import React from 'react';
import styles from '../customer.module.css';

export default function OffersPage() {
  return (
    <>
      <h1 style={{ fontSize: '22px', color: '#30213e', marginBottom: '15px' }}>Special Offers ✦</h1>
      <div className={styles.hero} style={{ marginTop: 0 }}>
        <div className={styles.heroText}>
          <p className={styles.heroEyebrow}>LIMITED TIME OFFER</p>
          <h2>Get 50% OFF <br/>On First Consult</h2>
          <p>Use code: <strong>ASTRO50</strong> at checkout.</p>
        </div>
      </div>
      <div className={styles.panel} style={{ marginTop: '20px' }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#392747', fontSize: '15px' }}>Refer & Earn</h3>
        <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>Invite your friends and get ₹100 wallet cash.</p>
      </div>
    </>
  );
}