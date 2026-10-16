
"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

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
    about:
      "Aarav specializes in Vedic astrology and birth chart interpretation. His consultations focus on helping people reflect on career choices, relationships and important life decisions.",
    color: "#f4e5c8",
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
    about:
      "Meera focuses on relationship-related astrology and personal growth. Her consultations offer a space to discuss questions about relationships and compatibility.",
    color: "#eadcf8",
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
    about:
      "Rudra specializes in career-focused astrological consultations. Discuss professional goals and possible paths while making your own informed decisions.",
    color: "#dce9f8",
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
    about:
      "Ananya offers numerology-based consultations for people interested in exploring number symbolism and its traditional interpretations in their lives.",
    color: "#f7dfeb",
  },
];

export default function AstrologerProfilePage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();

  const [bookingType, setBookingType] = useState("Chat");
  const [showBooking, setShowBooking] = useState(false);

  const astrologer = astrologers.find(
    (item) => item.slug === params.slug
  );

  if (!astrologer) {
    return (
      <main style={styles.notFound}>
        <div style={styles.notFoundIcon}>☾</div>
        <h1>Astrologer not found</h1>
        <p>Please choose an astrologer from our listing.</p>
        <Link href="/customer/astrologers" style={styles.primaryButton}>
          Explore Astrologers
        </Link>
      </main>
    );
  }

  function handleBooking() {
    setShowBooking(true);
  }

  return (
    <main style={styles.page}>
      <header style={styles.navbar}>
        <Link href="/customer/astrologers" style={styles.brand}>
          <span style={styles.brandIcon}>✦</span>
          <span>
            <strong>AstroConnect</strong>
            <small>Your cosmic guide</small>
          </span>
        </Link>

        <Link href="/customer/astrologers" style={styles.backLink}>
          ← All Astrologers
        </Link>
      </header>

      <div style={styles.container}>
        <div style={styles.breadcrumb}>
          <Link href="/customer">Dashboard</Link>
          <span>/</span>
          <Link href="/customer/astrologers">Astrologers</Link>
          <span>/</span>
          <span>{astrologer.name}</span>
        </div>

        <section style={styles.profileCard}>
          <div
            style={{
              ...styles.cover,
              background: `linear-gradient(120deg, #29153f, #543276 65%, ${astrologer.color})`,
            }}
          >
            <span style={styles.coverStar}>✧</span>
            <span style={styles.coverCircle}>✦</span>
            <span style={styles.coverMoon}>☾</span>
          </div>

          <div style={styles.profileBody}>
            <div style={styles.profileTop}>
              <div
                style={{
                  ...styles.avatar,
                  background: astrologer.color,
                }}
              >
                {astrologer.icon}
              </div>

              <div style={styles.profileHeading}>
                <span style={styles.eyebrow}>ASTROCONNECT CONSULTANT</span>
                <h1>{astrologer.name}</h1>
                <p style={styles.specialty}>{astrologer.specialty}</p>

                <div style={styles.ratingLine}>
                  <span style={styles.rating}>★ {astrologer.rating}</span>
                  <span>•</span>
                  <span>{astrologer.experience} experience</span>
                </div>
              </div>
            </div>

            <p style={styles.description}>{astrologer.description}</p>

            <div style={styles.infoGrid}>
              <div style={styles.infoItem}>
                <span style={styles.infoIcon}>◷</span>
                <div>
                  <small>Experience</small>
                  <strong>{astrologer.experience}</strong>
                </div>
              </div>

              <div style={styles.infoItem}>
                <span style={styles.infoIcon}>◎</span>
                <div>
                  <small>Languages</small>
                  <strong>{astrologer.language}</strong>
                </div>
              </div>

              <div style={styles.infoItem}>
                <span style={styles.infoIcon}>✦</span>
                <div>
                  <small>Specialization</small>
                  <strong>{astrologer.specialty}</strong>
                </div>
              </div>
            </div>

            <div style={styles.aboutSection}>
              <h2>About the Astrologer</h2>
              <p>{astrologer.about}</p>
              <p style={styles.disclaimer}>
                Astrology is a traditional belief-based practice and should
                not replace professional medical, legal or financial advice.
              </p>
            </div>

            <div style={styles.bookingCard}>
              <div>
                <span style={styles.bookingLabel}>CONSULTATION FEE</span>
                <div style={styles.price}>
                  ₹{astrologer.price}
                  <span>/ session</span>
                </div>
                <p style={styles.bookingHint}>
                  Select a consultation type to continue.
                </p>
              </div>

              <button
                type="button"
                style={styles.primaryButton}
                onClick={handleBooking}
              >
                Book Consultation <span>→</span>
              </button>
            </div>

            {showBooking && (
              <section style={styles.bookingForm}>
                <h2>Choose Consultation Type</h2>
                <p>
                  Select how you would like to consult with{" "}
                  {astrologer.name}.
                </p>

                <div style={styles.bookingOptions}>
                  {["Chat", "Call", "Video"].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setBookingType(type)}
                      style={{
                        ...styles.optionButton,
                        ...(bookingType === type
                          ? styles.optionSelected
                          : {}),
                      }}
                    >
                      {type === "Chat"
                        ? "💬"
                        : type === "Call"
                          ? "☎"
                          : "▣"}{" "}
                      {type}
                    </button>
                  ))}
                </div>

                <div style={styles.bookingSummary}>
                  <span>Astrologer</span>
                  <strong>{astrologer.name}</strong>
                  <span>Consultation</span>
                  <strong>{bookingType}</strong>
                  <span>Fee</span>
                  <strong>₹{astrologer.price}</strong>
                </div>

                <p style={styles.demoMessage}>
                  Booking preview only. A real booking requires connecting
                  this form to your booking API and payment flow.
                </p>

                <div style={styles.bookingActions}>
                  <button
                    type="button"
                    style={styles.secondaryButton}
                    onClick={() => setShowBooking(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    style={styles.primaryButton}
                    onClick={() =>
                      router.push(
                        `/customer/bookings?astrologer=${astrologer.slug}&type=${bookingType.toLowerCase()}`
                      )
                    }
                  >
                    Continue <span>→</span>
                  </button>
                </div>
              </section>
            )}
          </div>
        </section>

        <div style={styles.bottomLink}>
          <Link href="/customer/astrologers">
            ← Find another astrologer
          </Link>
        </div>
      </div>

      <footer style={styles.footer}>
        <span>✦ AstroConnect</span>
        <span>Your questions, our guidance.</span>
      </footer>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(ellipse at 5% 0%, #eee2fa 0, transparent 35%), #faf8ff",
    color: "#2b1a3b",
    fontFamily: "Arial, sans-serif",
  },
  navbar: {
    minHeight: 76,
    padding: "15px 6%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    background: "#ffffffed",
    borderBottom: "1px solid #eee5f7",
    position: "sticky",
    top: 0,
    zIndex: 10,
    backdropFilter: "blur(12px)",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    textDecoration: "none",
    color: "#32194d",
  },
  brandIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    color: "#fff",
    fontSize: 23,
    background: "linear-gradient(135deg, #8050bd, #42205f)",
    boxShadow: "0 6px 18px #8050bd40",
  },
  backLink: {
    color: "#68438a",
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 600,
  },
  container: {
    width: "min(940px, 90%)",
    margin: "0 auto",
    padding: "30px 0 60px",
  },
  breadcrumb: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 22,
    color: "#95869f",
    fontSize: 12,
  },
  profileCard: {
    overflow: "hidden",
    border: "1px solid #eee4f5",
    borderRadius: 24,
    background: "#fff",
    boxShadow: "0 20px 60px #3a1d5010",
    animation: "profileAppear 0.55s ease both",
  },
  cover: {
    height: 170,
    position: "relative",
    overflow: "hidden",
  },
  coverStar: {
    position: "absolute",
    top: 30,
    left: "15%",
    color: "#f2dba8",
    fontSize: 30,
  },
  coverCircle: {
    position: "absolute",
    top: -90,
    right: "15%",
    width: 260,
    height: 260,
    border: "1px solid #ffffff35",
    borderRadius: "50%",
    color: "#f3dba8",
    display: "grid",
    placeItems: "center",
    fontSize: 45,
  },
  coverMoon: {
    position: "absolute",
    right: "25%",
    bottom: -28,
    color: "#f1d9a3",
    fontSize: 125,
    opacity: 0.9,
  },
  profileBody: {
    padding: "0 38px 38px",
  },
  profileTop: {
    display: "flex",
    alignItems: "flex-end",
    gap: 22,
    marginTop: -48,
    position: "relative",
  },
  avatar: {
    width: 112,
    height: 112,
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    border: "5px solid #fff",
    borderRadius: 28,
    boxShadow: "0 8px 25px #32194d18",
    color: "#664181",
    fontSize: 62,
  },
  profileHeading: {
    paddingBottom: 7,
  },
  eyebrow: {
    color: "#a16c32",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 2,
  },
  specialty: {
    margin: "6px 0 10px",
    color: "#9164b1",
    fontSize: 13,
    fontWeight: 700,
  },
  ratingLine: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    color: "#84758f",
    fontSize: 12,
  },
  rating: {
    color: "#a4742e",
    fontWeight: 700,
  },
  description: {
    margin: "25px 0",
    color: "#7f718b",
    fontSize: 14,
    lineHeight: 1.8,
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  infoItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 17,
    border: "1px solid #eee5f4",
    borderRadius: 15,
    background: "#fcfaff",
  },
  infoIcon: {
    width: 38,
    height: 38,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    borderRadius: 12,
    background: "#efe4f8",
    color: "#724694",
    fontSize: 19,
  },
  aboutSection: {
    marginTop: 32,
    paddingTop: 28,
    borderTop: "1px solid #f0eaf4",
  },
  bookingCard: {
    marginTop: 30,
    padding: 24,
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 20,
    border: "1px solid #e8dcef",
    borderRadius: 18,
    background: "linear-gradient(120deg, #fcf8ff, #fffaf1)",
  },
  bookingLabel: {
    color: "#a16c32",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1.8,
  },
  price: {
    marginTop: 8,
    color: "#352044",
    fontSize: 30,
    fontWeight: 800,
  },
  bookingHint: {
    margin: "6px 0 0",
    color: "#95869f",
    fontSize: 12,
  },
  primaryButton: {
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    padding: "14px 20px",
    border: "none",
    borderRadius: 12,
    background: "linear-gradient(135deg, #8050bd, #563076)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    textDecoration: "none",
    cursor: "pointer",
    boxShadow: "0 8px 20px #68408e25",
  },
  bookingForm: {
    marginTop: 22,
    padding: 25,
    border: "1px solid #e9def2",
    borderRadius: 18,
    background: "#fdfbff",
  },
  bookingOptions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    margin: "20px 0",
  },
  optionButton: {
    padding: "12px 18px",
    border: "1px solid #e6dced",
    borderRadius: 12,
    background: "#fff",
    color: "#68438a",
    cursor: "pointer",
  },
  optionSelected: {
    borderColor: "#8050bd",
    background: "#f0e5fa",
    boxShadow: "0 0 0 2px #8050bd15",
  },
  bookingSummary: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    padding: 18,
    borderRadius: 12,
    background: "#f4edf9",
    fontSize: 13,
  },
  demoMessage: {
    color: "#8b7c95",
    fontSize: 12,
    lineHeight: 1.7,
  },
  bookingActions: {
    display: "flex",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 18,
  },
  secondaryButton: {
    padding: "13px 18px",
    border: "1px solid #e6dced",
    borderRadius: 12,
    background: "#fff",
    color: "#68438a",
    cursor: "pointer",
  },
  disclaimer: {
    padding: 14,
    borderRadius: 10,
    background: "#faf6ff",
    color: "#91839d",
    fontSize: 11,
    lineHeight: 1.7,
  },
  bottomLink: {
    marginTop: 25,
    fontSize: 13,
  },
  footer: {
    display: "flex",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 15,
    padding: 25,
    borderTop: "1px solid #eee5f4",
    background: "#fff",
    color: "#76528e",
    fontSize: 12,
  },
  notFound: {
    minHeight: "80vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
    textAlign: "center",
    background: "#faf8ff",
    color: "#352044",
    fontFamily: "Arial, sans-serif",
  },
  notFoundIcon: {
    color: "#9468b6",
    fontSize: 55,
  },
};
