"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import styles from "../customer.module.css"; // Layout CSS

const astrologers = [
  { name: "Aarav Sharma", slug: "aarav-sharma", specialty: "Vedic Astrology", experience: "8 years", rating: 4.9, price: 499, language: "Hindi, English", icon: "☀", description: "Personal guidance for career, relationships and life decisions." },
  { name: "Meera Joshi", slug: "meera-joshi", specialty: "Love & Relationships", experience: "6 years", rating: 4.8, price: 399, language: "Hindi, English", icon: "☾", description: "Thoughtful guidance for relationships and personal growth." },
  { name: "Rudra Verma", slug: "rudra-verma", specialty: "Career & Finance", experience: "10 years", rating: 4.9, price: 599, language: "Hindi", icon: "✦", description: "Explore career choices and financial goals with clarity." },
  { name: "Ananya Mishra", slug: "ananya-mishra", specialty: "Numerology", experience: "5 years", rating: 4.7, price: 349, language: "Hindi, English", icon: "✧", description: "Numerology-based insights for your personal journey." },
];

const categories = ["All", "Vedic Astrology", "Love & Relationships", "Career & Finance", "Numerology"];
type SortOption = "recommended" | "rating" | "price";

export default function FindAstrologersPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<SortOption>("recommended");

  const filteredAstrologers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const results = astrologers.filter((astrologer) => {
      const searchableText = [astrologer.name, astrologer.specialty, astrologer.language, astrologer.description].join(" ").toLowerCase();
      return searchableText.includes(query) && (category === "All" || astrologer.specialty === category);
    });

    if (sort === "rating") return [...results].sort((a, b) => b.rating - a.rating);
    if (sort === "price") return [...results].sort((a, b) => a.price - b.price);
    return results;
  }, [search, category, sort]);

  return (
    <>
      <Link href="/customer" style={{ textDecoration: 'none', color: '#65418c', fontSize: '12px', display: 'inline-block', marginBottom: '15px' }}>
        <i className="fa-solid fa-arrow-left"></i> Back to Dashboard
      </Link>

      <h1 style={{ fontSize: '22px', color: '#30213e', margin: '0 0 10px 0' }}>Find Your Astrologer ✦</h1>
      <p className={styles.muted} style={{ marginBottom: '20px' }}>Discover a guide who understands your questions.</p>

      {/* Search Bar */}
      <div className={styles.field} style={{ marginBottom: '15px' }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, specialty..."
          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }}
        />
      </div>

      {/* Categories */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '15px' }}>
        {categories.map((item) => (
          <button
            key={item}
            onClick={() => setCategory(item)}
            style={{
              padding: '6px 12px', borderRadius: '20px', border: '1px solid #ddd', fontSize: '11px', whiteSpace: 'nowrap',
              background: category === item ? '#65418c' : '#fff', color: category === item ? '#fff' : '#555'
            }}
          >
            {item}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {filteredAstrologers.map((astro) => (
          <div key={astro.slug} className={styles.panel} style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ width: '50px', height: '50px', background: '#f4edfb', color: '#65418c', display: 'grid', placeItems: 'center', borderRadius: '50%', fontSize: '24px' }}>
                  {astro.icon}
                </div>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#30213e' }}>{astro.name}</h3>
                  <p style={{ margin: 0, fontSize: '11px', color: '#888' }}>{astro.specialty}</p>
                </div>
              </div>
              <span style={{ background: '#fff6df', color: '#c4953c', padding: '4px 8px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold' }}>
                ★ {astro.rating}
              </span>
            </div>
            
            <p style={{ fontSize: '12px', color: '#555', margin: '12px 0' }}>{astro.description}</p>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
              <div>
                <strong style={{ fontSize: '16px', color: '#30213e' }}>₹{astro.price}</strong>
                <small style={{ fontSize: '10px', color: '#888' }}> / consult</small>
              </div>
              <Link href={`/customer/astrologers/${astro.slug}`} className={styles.primaryButton} style={{ textDecoration: 'none' }}>
                View Profile <i className="fa-solid fa-arrow-right"></i>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}