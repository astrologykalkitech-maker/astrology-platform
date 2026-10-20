"use client";
import React from 'react';
import styles from '../customer.module.css';

export default function ProfilePage() {
  return (
    <>
      <div className={styles.cardHeader} style={{ borderBottom: 'none', marginBottom: '20px', paddingBottom: 0 }}>
        <h2 style={{ fontFamily: 'var(--font-cinzel)', margin: 0, fontSize: '24px', color: 'var(--text-dark)' }}>My Profile</h2>
      </div>

      <div className={styles.card} style={{ maxWidth: '600px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '30px', paddingBottom: '20px', borderBottom: '1px solid var(--border)' }}>
          <div className={styles.profileIcon} style={{ width: '80px', height: '80px', fontSize: '32px' }}>D</div>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', color: 'var(--text-dark)', fontWeight: 700 }}>Dolly Vishwakarma</h2>
            <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: 'var(--text-muted)' }}>dolly@example.com</p>
          </div>
        </div>

        <form>
          <div className={styles.formGroup}>
            <label>Full Name</label>
            <input type="text" defaultValue="Dolly Vishwakarma" />
          </div>
          <div className={styles.formGroup}>
            <label>Email Address</label>
            <input type="email" defaultValue="dolly@example.com" />
          </div>
          <div className={styles.formGroup}>
            <label>Phone Number</label>
            <input type="tel" placeholder="+91 XXXXX XXXXX" />
          </div>
          
          <button className={styles.btnGold} type="button" style={{ width: '100%', marginTop: '20px', padding: '12px' }}>
            Save Changes
          </button>
        </form>

        <div style={{ marginTop: '20px' }}>
          <button style={{ width: '100%', padding: '12px', background: 'transparent', border: '1px solid #ff4d4f', color: '#ff4d4f', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
            Logout
          </button>
        </div>
      </div>
    </>
  );
}