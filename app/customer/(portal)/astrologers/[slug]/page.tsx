"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CUSTOMER_BOOKINGS_STORAGE_KEY, isCustomerDemoBooking, type CustomerDemoBooking } from "@/lib/customer-demo";
import styles from "./profile.module.css";

const astrologers = [
  { slug: "aarav-sharma", name: "Aarav Sharma", specialty: "Vedic Astrology", experience: "8+ Years", rating: "4.9", price: 499, languages: "Hindi, English", symbol: "☀", description: "Get personalized guidance about your career, relationships, and life journey through traditional Vedic astrology." },
  { slug: "meera-joshi", name: "Meera Joshi", specialty: "Love & Relationships", experience: "6+ Years", rating: "4.8", price: 399, languages: "Hindi, English", symbol: "☾", description: "Explore relationship questions and gain a fresh perspective on love, compatibility, and personal growth." },
  { slug: "rudra-verma", name: "Rudra Verma", specialty: "Career & Finance", experience: "10+ Years", rating: "4.9", price: 599, languages: "Hindi, English", symbol: "✧", description: "Discuss career decisions, professional goals, and financial concerns with a personalized astrology consultation." },
  { slug: "ananya-mishra", name: "Ananya Mishra", specialty: "Numerology", experience: "5+ Years", rating: "4.7", price: 349, languages: "Hindi, English", symbol: "✺", description: "Discover numerology insights based on your numbers and explore themes in your personal journey." },
];

const slots = ["10:00 AM", "11:30 AM", "01:00 PM", "03:00 PM", "05:30 PM", "07:00 PM"];
const consultationTypes = ["Chat", "Call", "Video"] as const;

export default function AstrologerProfilePage() {
  const params = useParams<{ slug: string }>();
  const astrologer = astrologers.find((item) => item.slug === params.slug);

  const [consultation, setConsultation] = useState<"Chat" | "Call" | "Video">("Chat");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [savedBooking, setSavedBooking] = useState(false);
  const [bookingNotice, setBookingNotice] = useState("");

  if (!astrologer) {
    return (
      <div style={{ textAlign: "center", padding: "50px 20px" }}>
        <h1 style={{ color: "#30213e", fontSize: "20px" }}>Astrologer not found</h1>
        <Link href="/customer/astrologers" style={{ color: "#65418c", marginTop: "10px", display: "inline-block" }}>Browse astrologers</Link>
      </div>
    );
  }

  function handleReviewBooking() {
    setBookingNotice("");
    if (!date || !time) {
      setBookingNotice("Please select a date and time slot.");
      return;
    }
    setConfirmed(true);
    setSavedBooking(false);
  }

  function confirmDemoBooking() {
    const booking: CustomerDemoBooking = {
      id: `BK-${Date.now()}`,
      astrologer: astrologer!.name,
      service: astrologer!.specialty,
      consultation, date, time, status: "Upcoming", price: astrologer!.price,
    };

    try {
      const saved = localStorage.getItem(CUSTOMER_BOOKINGS_STORAGE_KEY);
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(parsed) || !parsed.every(isCustomerDemoBooking)) throw new Error("Invalid format");
      localStorage.setItem(CUSTOMER_BOOKINGS_STORAGE_KEY, JSON.stringify([booking, ...parsed]));
      setSavedBooking(true);
    } catch {
      setBookingNotice("Could not save booking.");
    }
  }

  return (
    <>
      <Link href="/customer/astrologers" className={styles.back} style={{ display: 'inline-block', marginBottom: '15px' }}>
        <i className="fa-solid fa-arrow-left"></i> Back
      </Link>

      <section className={styles.hero}>
        <div className={styles.profileCard}>
          <div className={styles.avatar}>{astrologer.symbol}</div>
          <div className={styles.profileInfo}>
            <span className={styles.verified}>✦ VERIFIED</span>
            <h1>{astrologer.name}</h1>
            <p className={styles.specialty}>{astrologer.specialty}</p>
            <div className={styles.stats}>
              <span>★ {astrologer.rating}</span>
              <span>{astrologer.experience}</span>
              <span>{astrologer.languages}</span>
            </div>
            <p className={styles.description}>{astrologer.description}</p>
            <div style={{ marginTop: '15px' }}>
              <Link
                href={`/customer/enquiries/new?astrologerName=${encodeURIComponent(astrologer.name)}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: 'var(--gold)',
                  color: '#fff',
                  textDecoration: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                <i className="fa-solid fa-paper-plane"></i> Contact This Astrologer
              </Link>
            </div>
          </div>
        </div>

        <aside className={styles.bookingCard}>
          <span className={styles.eyebrow}>PERSONAL CONSULTATION</span>
          <h2>Book a session</h2>

          <h3>Consultation type</h3>
          <div className={styles.typeGrid}>
            {consultationTypes.map((type) => (
              <button key={type} className={`${styles.typeButton} ${consultation === type ? styles.selected : ""}`} onClick={() => { setConsultation(type); setConfirmed(false); setSavedBooking(false); }}>
                {type === "Chat" ? "☷" : type === "Call" ? "♧" : "▣"}
                <span>{type}</span>
              </button>
            ))}
          </div>

          <h3>Select date</h3>
          <input className={styles.dateInput} type="date" min={new Date().toLocaleDateString("en-CA")} value={date} onChange={(e) => { setDate(e.target.value); setConfirmed(false); setSavedBooking(false); }} />

          <h3>Available time slots</h3>
          <div className={styles.slotGrid}>
            {slots.map((slot) => (
              <button key={slot} className={`${styles.slot} ${time === slot ? styles.slotSelected : ""}`} onClick={() => { setTime(slot); setConfirmed(false); setSavedBooking(false); }}>
                {slot}
              </button>
            ))}
          </div>

          <div className={styles.priceRow}>
            <div><span className={styles.muted}>Price</span><div className={styles.price}>₹{astrologer.price}</div></div>
          </div>

          <button type="button" className={styles.bookButton} onClick={handleReviewBooking}>Review Booking <span>→</span></button>
          {bookingNotice && <p className={styles.bookingNotice}>{bookingNotice}</p>}

          {confirmed && (
            <div className={styles.confirmation}>
              <strong>Booking summary</strong>
              <p>Astrologer: {astrologer.name}</p>
              <p>Type: {consultation}</p>
              <p>Date: {date} | Time: {time}</p>
              <p>Total: ₹{astrologer.price}</p>
              {savedBooking ? (
                <Link href="/customer/bookings" className={styles.bookingsLink}>View my bookings ↗</Link>
              ) : (
                <button type="button" className={styles.confirmButton} onClick={confirmDemoBooking}>Confirm booking</button>
              )}
            </div>
          )}
        </aside>
      </section>
    </>
  );
}