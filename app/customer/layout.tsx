"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './customer.module.css';

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Tumhare purane routes waise hi hain
  const isHome = pathname === '/customer';
  const isEnquiries = pathname.includes('/enquiries');
  const isOffers = pathname.includes('/offers');
  const isProfile = pathname.includes('/login') || pathname.includes('/profile');

  return (
    <div className={styles.layoutWrapper}>
      
      {/* DESKTOP SIDEBAR (Dark Theme) */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarOverlay}></div>
        <div className={styles.sidebarContent}>
          
          <Link href="/customer" className={styles.brand}>
            <i className="fa-solid fa-wand-magic-sparkles"></i> 
            <div>
              <span>AstroConnect</span>
              <small>Customer Portal</small>
            </div>
          </Link>
          
          <div className={styles.navMenu}>
            <Link href="/customer" className={`${styles.navItem} ${isHome ? styles.active : ''}`}>
              <i className="fa-solid fa-house"></i> Home
            </Link>
            <Link href="/customer/enquiries" className={`${styles.navItem} ${isEnquiries ? styles.active : ''}`}>
              <i className="fa-solid fa-clipboard-list"></i> Enquiries
            </Link>
            <Link href="/customer/offers" className={`${styles.navItem} ${isOffers ? styles.active : ''}`}>
              <i className="fa-solid fa-gift"></i> Offers
            </Link>
            <Link href="/customer/login" className={`${styles.navItem} ${isProfile ? styles.active : ''}`}>
              <i className="fa-regular fa-user"></i> Profile
            </Link>
          </div>

          <div className={styles.sidebarFooter}>
            <p>Find the Right Guidance<br/>for a Brighter Tomorrow</p>
          </div>
        </div>
      </aside>

      {/* MOBILE HEADER (Top) */}
      <header className={styles.mobileHeader}>
        <Link href="/customer" className={styles.brand} style={{ margin: 0, fontSize: '18px' }}>
          <i className="fa-solid fa-wand-magic-sparkles"></i> AstroConnect
        </Link>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <Link href="/customer/notification" style={{ color: '#f4d79e' }}><i className="fa-regular fa-bell" style={{ fontSize: '18px' }}></i></Link>
          <Link href="/customer/login" className={styles.profileIcon} style={{ width: '30px', height: '30px', fontSize: '12px' }}>D</Link>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className={styles.mainContent}>
        
        {/* DESKTOP TOPBAR (White) */}
        <div className={styles.topbar}>
          <div className={styles.searchBar}>
            <i className="fa-solid fa-magnifying-glass"></i>
            <input type="text" placeholder="Search astrologers, services..." />
          </div>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <Link href="/customer/notification" style={{ color: '#666' }}><i className="fa-regular fa-bell" style={{ fontSize: '18px', cursor: 'pointer' }}></i></Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#333' }}>Dolly Vishwakarma</span>
              <Link href="/customer/login" className={styles.profileIcon} style={{ width: '35px', height: '35px', fontSize: '14px' }}>D</Link>
            </div>
          </div>
        </div>
        
        {/* Page Content Renders Here */}
        <div className={styles.pageContainer}>
          {children}
        </div>
      </main>

      {/* MOBILE BOTTOM NAV */}
      <nav className={styles.bottomNav}>
        <Link href="/customer" className={`${styles.bottomNavItem} ${isHome ? styles.active : ''}`}>
          <i className="fa-solid fa-house"></i>
          <span>Home</span>
        </Link>
        <Link href="/customer/enquiries" className={`${styles.bottomNavItem} ${isEnquiries ? styles.active : ''}`}>
          <i className="fa-solid fa-clipboard-list"></i>
          <span>Enquiries</span>
        </Link>
        <Link href="/customer/offers" className={`${styles.bottomNavItem} ${isOffers ? styles.active : ''}`}>
          <i className="fa-solid fa-gift"></i>
          <span>Offers</span>
        </Link>
        <Link href="/customer/login" className={`${styles.bottomNavItem} ${isProfile ? styles.active : ''}`}>
          <i className="fa-regular fa-user"></i>
          <span>Profile</span>
        </Link>
      </nav>

    </div>
  );
}