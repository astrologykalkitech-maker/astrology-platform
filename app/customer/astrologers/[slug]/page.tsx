
"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  CUSTOMER_BOOKINGS_STORAGE_KEY,
  isCustomerDemoBooking,
  type CustomerDemoBooking,
} from "@/lib/customer-demo";
import styles from "./profile.module.css";

const astrologers = [
  {
    slug: "aarav-sharma",
    name: "Aarav Sharma",
    specialty: "Vedic Astrology",
    experience: "8+ Years",
    rating: "4.9",
    price: 499,
    languages: "Hindi, English",
    symbol: "☀",
    description:
      "Get personalized guidance about your career, relationships, and life journey through traditional Vedic astrology.",
  },
  {
    slug: "meera-joshi",
    name: "Meera Joshi",
    specialty: "Love & Relationships",
    experience: "6+ Years",
    rating: "4.8",
    price: 399,
    languages: "Hindi, English",
    symbol: "☾",
    description:
      "Explore relationship questions and gain a fresh perspective on love, compatibility, and personal growth.",
  },
  {
    slug: "rudra-verma",
    name: "Rudra Verma",
    specialty: "Career & Finance",
    experience: "10+ Years",
    rating: "4.9",
    price: 599,
    languages: "Hindi, English",
    symbol: "✧",
    description:
      "Discuss career decisions, professional goals, and financial concerns with a personalized astrology consultation.",
  },
  {
    slug: "ananya-mishra",
    name: "Ananya Mishra",
    specialty: "Numerology",
    experience: "5+ Years",
    rating: "4.7",
    price: 349,
    languages: "Hindi, English",
    symbol: "✺",
    description:
      "Discover numerology insights based on your numbers and explore themes in your personal journey.",
  },
];

const slots = [
  "10:00 AM",
  "11:30 AM",
  "01:00 PM",
  "03:00 PM",
  "05:30 PM",
  "07:00 PM",
];

const consultationTypes = ["Chat", "Call", "Video"] as const;

export default function AstrologerProfilePage() {
  const params = useParams<{ slug: string }>();
  const astrologer = astrologers.find(
    (item) => item.slug === params.slug
  );

  const [consultation, setConsultation] = useState<"Chat" | "Call" | "Video">(
    "Chat",
  );
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [savedBooking, setSavedBooking] = useState(false);
  const [bookingNotice, setBookingNotice] = useState("");

  if (!astrologer) {
    return (
      <main className={styles.page}>
        <h1>Astrologer not found</h1>
        <Link href="/customer/astrologers">
          Browse astrologers
        </Link>
      </main>
    );
  }

  const selectedAstrologer = astrologer;

  function handleReviewBooking() {
    setBookingNotice("");

    if (!date || !time) {
      setBookingNotice("Please select a date and time slot before continuing.");
      return;
    }

    const selectedDate = new Date(`${date}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (Number.isNaN(selectedDate.getTime()) || selectedDate < today) {
      setBookingNotice("Please choose today or a future date.");
      return;
    }

    setConfirmed(true);
    setSavedBooking(false);
  }

  function confirmDemoBooking() {
    const booking: CustomerDemoBooking = {
      id: `BK-${Date.now()}`,
      astrologer: selectedAstrologer.name,
      service: selectedAstrologer.specialty,
      consultation,
      date,
      time,
      status: "Upcoming",
      price: selectedAstrologer.price,
    };

    try {
      const saved = localStorage.getItem(CUSTOMER_BOOKINGS_STORAGE_KEY);
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(parsed) || !parsed.every(isCustomerDemoBooking)) {
        throw new Error("Saved booking data has an invalid format.");
      }

      localStorage.setItem(
        CUSTOMER_BOOKINGS_STORAGE_KEY,
        JSON.stringify([booking, ...parsed]),
      );
      setSavedBooking(true);
      setBookingNotice("");
    } catch (error) {
      console.error("Unable to save demo booking:", error);
      setBookingNotice(
        "This browser could not save the demo booking. Please check browser storage and try again.",
      );
    }
  }

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/customer/astrologers" className={styles.back}>
          ← All Astrologers
        </Link>
        <span className={styles.brand}>✦ ASTRA</span>
        <span className={styles.navLabel}>Your cosmic journey</span>
      </nav>

      <section className={styles.hero}>
        <div className={styles.profileCard}>
          <div className={styles.avatar}>{astrologer.symbol}</div>
          <div className={styles.profileInfo}>
            <span className={styles.verified}>✦ VERIFIED ASTROLOGER</span>
            <h1>{astrologer.name}</h1>
            <p className={styles.specialty}>{astrologer.specialty}</p>
            <div className={styles.stats}>
              <span>★ {astrologer.rating} Rating</span>
              <span>{astrologer.experience}</span>
              <span>{astrologer.languages}</span>
            </div>
            <p className={styles.description}>
              {astrologer.description}
            </p>
          </div>
        </div>

        <aside className={styles.bookingCard}>
          <span className={styles.eyebrow}>PERSONAL CONSULTATION</span>
          <h2>Book a session</h2>
          <p className={styles.muted}>
            Choose how and when you would like to connect.
          </p>

          <h3>Consultation type</h3>
          <div className={styles.typeGrid}>
            {consultationTypes.map((type) => (
              <button
                key={type}
                type="button"
                className={`${styles.typeButton} ${
                  consultation === type ? styles.selected : ""
                }`}
                onClick={() => {
                  setConsultation(type);
                  setConfirmed(false);
                  setSavedBooking(false);
                  setBookingNotice("");
                }}
                aria-pressed={consultation === type}
              >
                {type === "Chat" ? "☷" : type === "Call" ? "♧" : "▣"}
                <span>{type}</span>
              </button>
            ))}
          </div>

          <h3>Select date</h3>
          <input
            className={styles.dateInput}
            type="date"
            min={new Date().toLocaleDateString("en-CA")}
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setConfirmed(false);
              setSavedBooking(false);
              setBookingNotice("");
            }}
            aria-label="Select consultation date"
            required
          />

          <h3>Available time slots</h3>
          <div className={styles.slotGrid}>
            {slots.map((slot) => (
              <button
                key={slot}
                type="button"
                className={`${styles.slot} ${
                  time === slot ? styles.slotSelected : ""
                }`}
                onClick={() => {
                  setTime(slot);
                  setConfirmed(false);
                  setSavedBooking(false);
                  setBookingNotice("");
                }}
                aria-pressed={time === slot}
              >
                {slot}
              </button>
            ))}
          </div>

          <div className={styles.priceRow}>
            <div>
              <span className={styles.muted}>Session price</span>
              <div className={styles.price}>₹{astrologer.price}</div>
            </div>
            <span className={styles.duration}>Per session</span>
          </div>

          <button
            type="button"
            className={styles.bookButton}
            onClick={handleReviewBooking}
          >
            Review Booking <span>→</span>
          </button>

          {bookingNotice && (
            <p className={styles.bookingNotice} role="alert">
              {bookingNotice}
            </p>
          )}

          {confirmed && (
            <div className={styles.confirmation}>
              <strong>Booking summary</strong>
              <p>Astrologer: {astrologer.name}</p>
              <p>Type: {consultation}</p>
              <p>Date: {date}</p>
              <p>Time: {time}</p>
              <p>Total: ₹{astrologer.price}</p>
              <small>
                Demo only — no payment is collected and no real appointment is booked.
              </small>
              {savedBooking ? (
                <Link href="/customer/bookings" className={styles.bookingsLink}>
                  View my demo bookings ↗
                </Link>
              ) : (
                <button
                  type="button"
                  className={styles.confirmButton}
                  onClick={confirmDemoBooking}
                >
                  Confirm demo booking
                </button>
              )}
            </div>
          )}

          <p className={styles.secure}>✦ Transparent pricing · Frontend demo</p>
        </aside>
      </section>

      <footer className={styles.footer}>
        ASTRA · Find clarity in your cosmic journey
      </footer>
    </main>
  );
}
