
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import styles from "./astrologers.module.css";

const astrologers = [
  {
    name: "Aarav Sharma",
    slug: "aarav-sharma",
    specialty: "Vedic Astrology",
    experience: "8 years",
    rating: 4.9,
    price: 499,
    language: "Hindi, English",
    icon: "☀",
    description:
      "Personal guidance for career, relationships and life decisions.",
  },
  {
    name: "Meera Joshi",
    slug: "meera-joshi",
    specialty: "Love & Relationships",
    experience: "6 years",
    rating: 4.8,
    price: 399,
    language: "Hindi, English",
    icon: "☾",
    description:
      "Thoughtful guidance for relationships and personal growth.",
  },
  {
    name: "Rudra Verma",
    slug: "rudra-verma",
    specialty: "Career & Finance",
    experience: "10 years",
    rating: 4.9,
    price: 599,
    language: "Hindi",
    icon: "✦",
    description:
      "Explore career choices and financial goals with clarity.",
  },
  {
    name: "Ananya Mishra",
    slug: "ananya-mishra",
    specialty: "Numerology",
    experience: "5 years",
    rating: 4.7,
    price: 349,
    language: "Hindi, English",
    icon: "✧",
    description:
      "Numerology-based insights for your personal journey.",
  },
];

const categories = [
  "All",
  "Vedic Astrology",
  "Love & Relationships",
  "Career & Finance",
  "Numerology",
];

type SortOption = "recommended" | "rating" | "price";

export default function FindAstrologersPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<SortOption>("recommended");

  const filteredAstrologers = useMemo(() => {
    const query = search.trim().toLowerCase();

    const results = astrologers.filter((astrologer) => {
      const searchableText = [
        astrologer.name,
        astrologer.specialty,
        astrologer.language,
        astrologer.description,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = searchableText.includes(query);
      const matchesCategory =
        category === "All" || astrologer.specialty === category;

      return matchesSearch && matchesCategory;
    });

    if (sort === "rating") {
      return [...results].sort(
        (a, b) => b.rating - a.rating || a.price - b.price
      );
    }

    if (sort === "price") {
      return [...results].sort(
        (a, b) => a.price - b.price || b.rating - a.rating
      );
    }

    return results;
  }, [search, category, sort]);

  function resetFilters() {
    setSearch("");
    setCategory("All");
    setSort("recommended");
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/customer" className={styles.brand}>
          <span className={styles.logo} aria-hidden="true">
            ✦
          </span>
          <span>
            <strong>AstroConnect</strong>
            <small>Your cosmic guide</small>
          </span>
        </Link>

        <Link href="/customer" className={styles.backLink}>
          ← Customer Dashboard
        </Link>
      </header>

      <section className={styles.content}>
        <p className={styles.eyebrow}>YOUR PERSONAL COSMIC GUIDE</p>

        <h1>
          Find Your Astrologer <span aria-hidden="true">✦</span>
        </h1>

        <p className={styles.subtitle}>
          Discover a guide who understands your questions and helps you explore
          your next steps.
        </p>

        <div className={styles.hero}>
          <div>
            <span className={styles.heroLabel}>
              YOUR JOURNEY, YOUR CHOICE
            </span>
            <h2>A little guidance can bring a new perspective.</h2>
            <p>
              Explore specialties and find the right match for your needs.
            </p>
          </div>

          <div className={styles.heroMoon} aria-hidden="true">
            ☾
          </div>
        </div>

        <div className={styles.searchArea}>
          <label htmlFor="astrologer-search">
            Search astrologers
          </label>

          <input
            id="astrologer-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, specialty, language..."
            autoComplete="off"
          />
        </div>

        <div className={styles.filters} aria-label="Astrologer categories">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              className={
                category === item
                  ? styles.selectedFilter
                  : styles.filter
              }
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className={styles.resultsHeading}>
          <div>
            <h2>Meet our astrologers</h2>
            <p aria-live="polite">
              {filteredAstrologers.length}{" "}
              {filteredAstrologers.length === 1
                ? "profile"
                : "profiles"}{" "}
              found
            </p>
          </div>

          <label>
            <span className={styles.sortLabel}>Sort by</span>
            <select
              aria-label="Sort astrologers"
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as SortOption)
              }
            >
              <option value="recommended">Recommended</option>
              <option value="rating">Highest rated</option>
              <option value="price">Price: low to high</option>
            </select>
          </label>
        </div>

        {filteredAstrologers.length > 0 ? (
          <div className={styles.grid}>
            {filteredAstrologers.map((astrologer) => (
              <article
                className={styles.card}
                key={astrologer.slug}
              >
                <div className={styles.cardTop}>
                  <div
                    className={styles.avatar}
                    aria-hidden="true"
                  >
                    {astrologer.icon}
                  </div>

                  <span
                    className={styles.rating}
                    aria-label={`Rating ${astrologer.rating} out of 5`}
                  >
                    ★ {astrologer.rating}
                  </span>
                </div>

                <h3>{astrologer.name}</h3>

                <p className={styles.specialty}>
                  {astrologer.specialty}
                </p>

                <p className={styles.description}>
                  {astrologer.description}
                </p>

                <div className={styles.meta}>
                  <span>◷ {astrologer.experience} experience</span>
                  <span>◎ {astrologer.language}</span>
                </div>

                <div className={styles.cardBottom}>
                  <div className={styles.price}>
                    <strong>₹{astrologer.price}</strong>
                    <small>/ consultation</small>
                  </div>

                  <Link
                    href={`/customer/astrologers/${astrologer.slug}`}
                    className={styles.viewButton}
                    aria-label={`View profile of ${astrologer.name}`}
                  >
                    View Profile ↗
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty} role="status">
            <span aria-hidden="true">☾</span>
            <h3>No astrologers found</h3>
            <p>
              Try another name, language or specialty.
            </p>

            <button type="button" onClick={resetFilters}>
              Reset filters
            </button>
          </div>
        )}

        <div className={styles.demoNote}>
          Preview only: astrologer profiles, ratings and prices are
          sample data.
        </div>
      </section>

      <footer className={styles.footer}>
        ✦ AstroConnect{" "}
        <span>Your questions, our guidance.</span>
      </footer>
    </main>
  );
}