"use client";

import React from 'react';
import styles from '../customer.module.css';

export default function ProfilePage() {
  return (
    <>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', color: '#30213e', margin: 0 }}>My Profile</h1>
        <p style={{ fontSize: '12px', color: '#888', margin: '5px 0 0 0' }}>Manage your account settings</p>
      </div>

      <div className={styles.profileHeader}>
        <div className={styles.profileAvatar}>D</div>
        <h2 style={{ margin: 0, fontSize: '18px', color: '#30213e' }}>Dolly Vishwakarma</h2>
        <p style={{ margin: '5px 0', fontSize: '12px', color: '#888' }}>dolly@example.com</p>
      </div>

      <form className={styles.formPanel}>
        <label className={styles.field}>
          Full Name
          <input type="text" defaultValue="Dolly Vishwakarma" />
        </label>
        <label className={styles.field}>
          Email Address
          <input type="email" defaultValue="dolly@example.com" />
        </label>
        <label className={styles.field}>
          Phone Number
          <input type="tel" placeholder="+91 XXXXX XXXXX" />
        </label>
        
        <button className={styles.primaryButton} type="button" style={{ marginTop: '10px' }}>
          Save Changes
        </button>
      </form>

      <div style={{ marginTop: '30px', paddingBottom: '20px' }}>
        <button style={{ width: '100%', padding: '12px', background: 'transparent', border: '1px solid #ff4d4f', color: '#ff4d4f', borderRadius: '8px', fontWeight: 'bold' }}>
          Logout
        </button>
      </div>
    </>
  );
}