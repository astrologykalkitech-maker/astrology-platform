"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import styles from "../customer.module.css";

const astrologers = [
  { name: "Aarav Sharma", slug: "aarav-sharma", specialty: "Vedic Astrology", experience: "8 years", rating: 4.9, price: 499, language: "Hindi, English", icon: "☀", description: "Personal guidance for career, relationships and life decisions." },
  { name: "Meera Joshi", slug: "meera-joshi", specialty: "Love & Relationships", experience: "6 years", rating: 4.8, price: 399, language: "Hindi, English", icon: "☾", description: "Thoughtful guidance for relationships and personal growth." },
  { name: "Rudra Verma", slug: "rudra-verma", specialty: "Career & Finance", experience: "10 years", rating: 4.9, price: 599, language: "Hindi", icon: "✦", description: "Explore career choices and financial goals with clarity." },
  { name: "Ananya Mishra", slug: "ananya-mishra", specialty: "Numerology", experience: "5 years", rating: 4.7, price: 349, language: "Hindi, English", icon: "✧", description: "Numerology-based insights for your personal journey." },
];

const categories = ["All", "Vedic Astrology", "Love & Relationships", "Career & Finance", "Numerology"];

export default function FindAstrologersPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const filteredAstrologers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return astrologers.filter((astrologer) => {
      const searchableText = [astrologer.name, astrologer.specialty, astrologer.language, astrologer.description].join(" ").toLowerCase();
      return searchableText.includes(query) && (category === "All" || astrologer.specialty === category);
    });
  }, [search, category]);

  return (
    <>
      <div className={styles.cardHeader} style={{ borderBottom: 'none', marginBottom: '20px', paddingBottom: 0 }}>
        <h2 style={{ fontFamily: 'var(--font-cinzel)', margin: 0, fontSize: '24px', color: 'var(--text-dark)' }}>Find Your Astrologer ✦</h2>
      </div>

      {/* Search Bar */}
      <div className={styles.searchBar} style={{ width: '100%', marginBottom: '20px', background: '#fff', border: '1px solid var(--border)' }}>
        <i className="fa-solid fa-magnifying-glass" style={{ color: 'var(--text-muted)' }}></i>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, specialty..."
          style={{ color: '#333' }}
        />
      </div>

      {/* Categories */}
      <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '15px', marginBottom: '15px' }}>
        {categories.map((item) => (
          <button
            key={item}
            onClick={() => setCategory(item)}
            style={{
              padding: '8px 16px', borderRadius: '20px', border: '1px solid var(--border)', fontSize: '13px', whiteSpace: 'nowrap', cursor: 'pointer',
              background: category === item ? 'var(--gold)' : '#fff', color: category === item ? '#fff' : 'var(--text-dark)',
              fontWeight: category === item ? '600' : '400'
            }}
          >
            {item}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
        {filteredAstrologers.map((astro) => (
          <div key={astro.slug} className={styles.card} style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div className={styles.profileIcon} style={{ width: '50px', height: '50px', fontSize: '20px', background: '#f4edfb', color: 'var(--gold)' }}>
                  {astro.icon}
                </div>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: 'var(--text-dark)' }}>{astro.name}</h3>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--gold)', fontWeight: '600' }}>{astro.specialty}</p>
                </div>
              </div>
              <span style={{ background: '#fef3c7', color: '#d97706', padding: '4px 8px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold' }}>
                ★ {astro.rating}
              </span>
            </div>
            
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '15px 0', lineHeight: '1.5', height: '40px', overflow: 'hidden' }}>{astro.description}</p>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', borderTop: '1px solid var(--border)', paddingTop: '15px' }}>
              <div>
                <strong style={{ fontSize: '18px', color: 'var(--text-dark)' }}>₹{astro.price}</strong>
                <small style={{ fontSize: '11px', color: 'var(--text-muted)' }}> / consult</small>
              </div>
              <Link href={`/customer/astrologers/${astro.slug}`} className={styles.btnGold}>
                View Profile <i className="fa-solid fa-arrow-right"></i>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}