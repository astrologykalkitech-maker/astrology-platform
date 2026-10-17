"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './customer.module.css';

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Active Tab check karne ke liye
  const isHome = pathname === '/customer';
  const isEnquiries = pathname.includes('/enquiries'); // Chats ko Enquiries kar diya
  const isOffers = pathname.includes('/offers');
  const isProfile = pathname.includes('/login') || pathname.includes('/profile');

  return (
    <div className={styles.desktopWrapper}>
      <div className={styles.mobileFrame}>
        
        {/* Fixed Header */}
        <div className={styles.header}>
          <Link href="/customer" className={styles.logo} style={{ textDecoration: 'none' }}>
            <i className="fa-solid fa-wand-magic-sparkles"></i> AstroConnect
          </Link>
          <div className={styles.headerIcons}>
            <Link href="/customer/notification" style={{ color: '#65418c' }}><i className="fa-regular fa-bell"></i></Link>
            <Link href="/customer/login" style={{ color: '#65418c' }}><i className="fa-regular fa-user"></i></Link>
          </div>
        </div>

        {/* Scrollable Content (Yahan tumhare pages load honge) */}
        <div className={styles.scrollableContent}>
          {children}
        </div>

        {/* Fixed Bottom Navbar */}
        <div className={styles.bottomNav}>
          <Link href="/customer" className={`${styles.navItem} ${isHome ? styles.active : ''}`}>
            <i className="fa-solid fa-house"></i>
            <span>Home</span>
          </Link>
          
          {/* Yahan Chats ki jagah Enquiries link lagaya hai */}
          <Link href="/customer/enquiries" className={`${styles.navItem} ${isEnquiries ? styles.active : ''}`}>
            <i className="fa-solid fa-clipboard-list"></i>
            <span>Enquiries</span>
          </Link>
          
          <Link href="/customer/offers" className={`${styles.navItem} ${isOffers ? styles.active : ''}`}>
            <i className="fa-solid fa-gift"></i>
            <span>Offers</span>
          </Link>
          
          <Link href="/customer/login" className={`${styles.navItem} ${isProfile ? styles.active : ''}`}>
            <i className="fa-regular fa-user"></i>
            <span>Profile</span>
          </Link>
        </div>

      </div>
    </div>
  );
}