"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from '@/app/actions/auth';
import styles from './customer.module.css';

interface CustomerLayoutClientProps {
  children: React.ReactNode;
  customerName: string;
  userInitial: string;
}

export default function CustomerLayoutClient({
  children,
  customerName,
  userInitial,
}: CustomerLayoutClientProps) {
  const pathname = usePathname();
  const router = useRouter();

  const isHome = pathname === '/customer';
  const isEnquiries = pathname.includes('/enquiries');
  const isOffers = pathname.includes('/offers');
  const isAstrologers = pathname.includes('/astrologers');
  const isBookings = pathname.includes('/bookings');

  async function handleSignOut() {
    await signOut();
    router.push('/customer/login');
    router.refresh();
  }

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
            <Link href="/customer/astrologers" className={`${styles.navItem} ${isAstrologers ? styles.active : ''}`}>
              <i className="fa-solid fa-user-astronaut"></i> Astrologers
            </Link>
            <Link href="/customer/bookings" className={`${styles.navItem} ${isBookings ? styles.active : ''}`}>
              <i className="fa-solid fa-calendar-check"></i> Bookings
            </Link>
            <Link href="/customer/offers" className={`${styles.navItem} ${isOffers ? styles.active : ''}`}>
              <i className="fa-solid fa-gift"></i> Offers
            </Link>
            <button
              onClick={handleSignOut}
              className={styles.navItem}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
            >
              <i className="fa-solid fa-arrow-right-from-bracket"></i> Sign Out
            </button>
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
          <Link href="/customer/notification" style={{ color: '#f4d79e' }}>
            <i className="fa-regular fa-bell" style={{ fontSize: '18px' }}></i>
          </Link>
          <button
            onClick={handleSignOut}
            className={styles.profileIcon}
            style={{ width: '30px', height: '30px', fontSize: '12px', border: 'none', cursor: 'pointer' }}
            title="Sign Out"
          >
            {userInitial}
          </button>
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
            <Link href="/customer/notification" style={{ color: '#666' }}>
              <i className="fa-regular fa-bell" style={{ fontSize: '18px', cursor: 'pointer' }}></i>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#333' }}>
                {customerName}
              </span>
              <button
                onClick={handleSignOut}
                className={styles.profileIcon}
                style={{ width: '35px', height: '35px', fontSize: '14px', border: 'none', cursor: 'pointer' }}
                title="Click to sign out"
              >
                {userInitial}
              </button>
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
        <button
          onClick={handleSignOut}
          className={styles.bottomNavItem}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          <i className="fa-solid fa-arrow-right-from-bracket"></i>
          <span>Logout</span>
        </button>
      </nav>

    </div>
  );
}
