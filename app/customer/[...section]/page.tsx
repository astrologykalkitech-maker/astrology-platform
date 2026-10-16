
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CUSTOMER_BOOKINGS_STORAGE_KEY,
  isCustomerDemoBooking,
  type CustomerDemoBooking,
} from "@/lib/customer-demo";
import styles from "./customer-pages.module.css";

const pageContent: Record<
  string,
  { title: string; description: string; icon: string }
> = {
  bookings: {
    title: "My Bookings",
    description: "View your astrology consultation bookings.",
    icon: "◷",
  },
  wallet: {
    title: "My Wallet",
    description: "Manage your demo wallet and view transactions.",
    icon: "₹",
  },
  wallets: {
    title: "My Wallet",
    description: "Manage your demo wallet and view transactions.",
    icon: "₹",
  },
  horoscope: {
    title: "Daily Horoscope",
    description: "Explore today's zodiac-inspired guidance.",
    icon: "☼",
  },
  notification: {
    title: "Notifications",
    description: "Keep track of your latest updates.",
    icon: "♧",
  },
  notifications: {
    title: "Notifications",
    description: "Keep track of your latest updates.",
    icon: "♧",
  },
  help: {
    title: "Help & Support",
    description: "Find answers and send us your questions.",
    icon: "?",
  },
};

const sampleBookings: CustomerDemoBooking[] = [
  {
    id: "BK-1001",
    astrologer: "Aarav Sharma",
    service: "Vedic Astrology",
    date: "20 Oct 2026",
    time: "11:00 AM",
    status: "Upcoming",
    price: 499,
    consultation: "Chat",
  },
  {
    id: "BK-1002",
    astrologer: "Meera Joshi",
    service: "Love & Relationships",
    date: "12 Oct 2026",
    time: "04:30 PM",
    status: "Completed",
    price: 399,
    consultation: "Video",
  },
];

const demoTransactions = [
  { id: "TXN-1001", label: "Demo wallet credit", date: "14 Oct 2026", amount: 1000, type: "Credit" },
  { id: "TXN-1002", label: "Sample consultation", date: "12 Oct 2026", amount: -399, type: "Debit" },
];

function formatBookingDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

const zodiacSigns = [
  { name: "Aries", symbol: "♈", dates: "Mar 21 – Apr 19", message: "Take initiative, but give yourself time to consider your options." },
  { name: "Taurus", symbol: "♉", dates: "Apr 20 – May 20", message: "Steady progress and patience may help you stay focused today." },
  { name: "Gemini", symbol: "♊", dates: "May 21 – Jun 20", message: "A thoughtful conversation could bring a fresh perspective." },
  { name: "Cancer", symbol: "♋", dates: "Jun 21 – Jul 22", message: "Make room for rest and honest conversations with people you trust." },
  { name: "Leo", symbol: "♌", dates: "Jul 23 – Aug 22", message: "Share your ideas confidently while remaining open to feedback." },
  { name: "Virgo", symbol: "♍", dates: "Aug 23 – Sep 22", message: "Small, practical steps can help you organise your priorities." },
  { name: "Libra", symbol: "♎", dates: "Sep 23 – Oct 22", message: "Look for balance and communicate your needs clearly." },
  { name: "Scorpio", symbol: "♏", dates: "Oct 23 – Nov 21", message: "Pause before reacting and focus on what you can control." },
  { name: "Sagittarius", symbol: "♐", dates: "Nov 22 – Dec 21", message: "Stay curious and turn a big goal into manageable steps." },
  { name: "Capricorn", symbol: "♑", dates: "Dec 22 – Jan 19", message: "Consistency matters more than rushing toward an outcome." },
  { name: "Aquarius", symbol: "♒", dates: "Jan 20 – Feb 18", message: "Try a new perspective while keeping your plans realistic." },
  { name: "Pisces", symbol: "♓", dates: "Feb 19 – Mar 20", message: "Make time for creativity, reflection and clear boundaries." },
];

const demoNotifications = [
  { id: 1, title: "Welcome to AstroConnect", detail: "Explore your customer dashboard and available services.", date: "Today", read: false },
  { id: 2, title: "Consultation reminder", detail: "You have a sample consultation listed in My Bookings.", date: "14 Oct 2026", read: false },
  { id: 3, title: "Wallet update", detail: "Your demo wallet shows sample transaction data.", date: "12 Oct 2026", read: true },
];

const faqs = [
  {
    question: "How do I book an astrologer?",
    answer: "Open the Astrologers page, select a profile, choose a consultation option and review the demo booking details.",
  },
  {
    question: "Are wallet transactions real?",
    answer: "No. The wallet on this page uses sample data. No real money is stored, added or deducted.",
  },
  {
    question: "Will my enquiry be saved?",
    answer: "The current customer frontend stores enquiry changes in temporary page state. Database persistence requires backend integration.",
  },
  {
    question: "How can I contact support?",
    answer: "Use the message form below to preview a support request. It does not send a real message to a support team.",
  },
];

export default function CustomerSectionPage() {
  const params = useParams<{ section: string[] }>();
  const section = params.section?.[0] ?? "";
  const page = pageContent[section];

  const [selectedSign, setSelectedSign] = useState("Aries");
  const [notifications, setNotifications] = useState(demoNotifications);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [supportSubject, setSupportSubject] = useState("Booking question");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportNotice, setSupportNotice] = useState("");
  const [bookingFilter, setBookingFilter] = useState("All");
  const [copiedBooking, setCopiedBooking] = useState("");
  const [bookings, setBookings] = useState<CustomerDemoBooking[]>(sampleBookings);

  useEffect(() => {
    if (section !== "bookings") return;

    const loadTimer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(CUSTOMER_BOOKINGS_STORAGE_KEY);
        if (!saved) return;

        const parsed: unknown = JSON.parse(saved);
        if (!Array.isArray(parsed) || !parsed.every(isCustomerDemoBooking)) {
          throw new Error("Saved booking data has an invalid format.");
        }

        setBookings([...parsed, ...sampleBookings]);
      } catch (error) {
        console.error("Unable to restore demo bookings:", error);
        setSupportNotice("Saved bookings could not be loaded. Please check browser storage.");
      }
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [section]);

  if (!page) {
    return (
      <main className={styles.container}>
        <div className={styles.card}>
          <span className={styles.icon}>404</span>
          <h1>Page Not Found</h1>
          <p>This customer page does not exist.</p>
          <Link href="/customer" className={styles.button}>
            Back to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  const selectedHoroscope =
    zodiacSigns.find((sign) => sign.name === selectedSign) ?? zodiacSigns[0];

  function submitSupport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supportMessage.trim()) {
      setSupportNotice("Please describe your question first.");
      return;
    }

    setSupportNotice(
      "Demo request prepared. It has not been sent to a support team."
    );
    setSupportMessage("");
  }

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <Link href="/customer" className={styles.backLink}>
          ← Customer Dashboard
        </Link>
        <span className={styles.label}>CUSTOMER PORTAL</span>
      </header>

      <section className={styles.card}>
        <div className={styles.icon}>{page.icon}</div>
        <p className={styles.eyebrow}>YOUR ASTROLOGY JOURNEY</p>
        <h1>{page.title}</h1>
        <p className={styles.description}>{page.description}</p>

        {section === "bookings" && (
          <div className={styles.featureSection}>
            <div className={styles.summaryGrid}>
              <article className={styles.summaryItem}>
                <span>Total bookings</span>
                <strong>{bookings.length}</strong>
              </article>
              <article className={styles.summaryItem}>
                <span>Upcoming</span>
                <strong>{bookings.filter((b) => b.status === "Upcoming").length}</strong>
              </article>
              <article className={styles.summaryItem}>
                <span>Completed</span>
                <strong>{bookings.filter((b) => b.status === "Completed").length}</strong>
              </article>
            </div>

            <div className={styles.toolbar}>
              <h2>Your consultations</h2>
              <select
                value={bookingFilter}
                onChange={(event) => setBookingFilter(event.target.value)}
                aria-label="Filter bookings"
              >
                <option>All</option>
                <option>Upcoming</option>
                <option>Completed</option>
              </select>
            </div>

            {bookings
              .filter((booking) => bookingFilter === "All" || booking.status === bookingFilter)
              .map((booking) => (
                <article className={styles.dataCard} key={booking.id}>
                  <div className={styles.dataCardTop}>
                    <div>
                      <h3>{booking.astrologer}</h3>
                      <p>{booking.service} · {booking.consultation}</p>
                    </div>
                    <span className={styles.pill}>{booking.status}</span>
                  </div>
                  <div className={styles.detailGrid}>
                    <span>Booking ID<strong>{booking.id}</strong></span>
                    <span>Date & time<strong>{formatBookingDate(booking.date)} · {booking.time}</strong></span>
                    <span>Consultation fee<strong>₹{booking.price}</strong></span>
                  </div>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setCopiedBooking(booking.id)}
                  >
                    {copiedBooking === booking.id ? "Details selected ✓" : "View booking details"}
                  </button>
                  {copiedBooking === booking.id && (
                    <p className={styles.inlineNotice}>
                      Sample booking {booking.id}. No live booking has been retrieved.
                    </p>
                  )}
                </article>
              ))}

            <Link href="/customer/astrologers" className={styles.button}>
              Explore astrologers ↗
            </Link>
          </div>
        )}

        {(section === "wallet" || section === "wallets") && (
          <div className={styles.featureSection}>
            <div className={styles.walletCard}>
              <span>DEMO WALLET BALANCE</span>
              <strong>₹601</strong>
              <p>Sample balance · Not real money</p>
              <span className={styles.walletSymbol}>₹</span>
            </div>

            <div className={styles.toolbar}>
              <h2>Recent transactions</h2>
              <span className={styles.pill}>Demo history</span>
            </div>

            {demoTransactions.map((transaction) => (
              <article className={styles.transaction} key={transaction.id}>
                <div className={styles.transactionIcon}>
                  {transaction.type === "Credit" ? "↙" : "↗"}
                </div>
                <div className={styles.transactionText}>
                  <strong>{transaction.label}</strong>
                  <small>{transaction.date} · {transaction.id}</small>
                </div>
                <strong className={transaction.amount > 0 ? styles.credit : styles.debit}>
                  {transaction.amount > 0 ? "+" : "−"}₹{Math.abs(transaction.amount)}
                </strong>
              </article>
            ))}

            <p className={styles.inlineNotice}>
              Wallet balance and transactions are illustrative only. Payment APIs are not connected.
            </p>
          </div>
        )}

        {section === "horoscope" && (
          <div className={styles.featureSection}>
            <div className={styles.horoscopeBanner}>
              <span>✦ YOUR DAILY COSMIC NOTE ✦</span>
              <h2>A moment to pause, reflect and realign.</h2>
              <p>
                Select a zodiac sign to view a general, illustrative daily reading.
              </p>
            </div>

            <label className={styles.fieldLabel} htmlFor="zodiac-sign">
              Choose your zodiac sign
            </label>
            <select
              id="zodiac-sign"
              className={styles.fullSelect}
              value={selectedSign}
              onChange={(event) => setSelectedSign(event.target.value)}
            >
              {zodiacSigns.map((sign) => (
                <option key={sign.name} value={sign.name}>
                  {sign.symbol} {sign.name} · {sign.dates}
                </option>
              ))}
            </select>

            <article className={styles.horoscopeCard}>
              <span className={styles.zodiacSymbol}>{selectedHoroscope.symbol}</span>
              <p className={styles.eyebrow}>{selectedHoroscope.dates}</p>
              <h2>{selectedHoroscope.name}</h2>
              <p>{selectedHoroscope.message}</p>
              <div className={styles.horoscopeTags}>
                <span>Reflection</span>
                <span>Balance</span>
                <span>New perspective</span>
              </div>
            </article>

            <p className={styles.inlineNotice}>
              For reflection and entertainment only. This is sample content, not a personalised astrological prediction.
            </p>
          </div>
        )}

        {(section === "notification" || section === "notifications") && (
          <div className={styles.featureSection}>
            <div className={styles.toolbar}>
              <h2>Your updates</h2>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() =>
                  setNotifications((previous) =>
                    previous.map((item) => ({ ...item, read: true }))
                  )
                }
              >
                Mark all as read
              </button>
            </div>

            <p className={styles.inlineNotice}>
              {notifications.filter((item) => !item.read).length} unread notification(s)
            </p>

            {notifications.map((notification) => (
              <article
                className={`${styles.notification} ${
                  !notification.read ? styles.unread : ""
                }`}
                key={notification.id}
              >
                <span className={styles.notificationIcon}>
                  {notification.read ? "✓" : "✦"}
                </span>
                <div className={styles.notificationBody}>
                  <div className={styles.dataCardTop}>
                    <h3>{notification.title}</h3>
                    <small>{notification.date}</small>
                  </div>
                  <p>{notification.detail}</p>
                  {!notification.read && (
                    <button
                      type="button"
                      className={styles.textButton}
                      onClick={() =>
                        setNotifications((previous) =>
                          previous.map((item) =>
                            item.id === notification.id
                              ? { ...item, read: true }
                              : item
                          )
                        )
                      }
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {section === "help" && (
          <div className={styles.featureSection}>
            <div className={styles.supportBanner}>
              <span>✧</span>
              <div>
                <h2>How can we help?</h2>
                <p>Browse common questions or prepare a demo support request.</p>
              </div>
            </div>

            <h2 className={styles.sectionHeading}>Frequently asked questions</h2>

            {faqs.map((faq, index) => (
              <article className={styles.faq} key={faq.question}>
                <button
                  type="button"
                  className={styles.faqQuestion}
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  aria-expanded={openFaq === index}
                >
                  {faq.question}
                  <span>{openFaq === index ? "−" : "+"}</span>
                </button>
                {openFaq === index && (
                  <p className={styles.faqAnswer}>{faq.answer}</p>
                )}
              </article>
            ))}

            <form className={styles.supportForm} onSubmit={submitSupport}>
              <h2>Contact support</h2>

              <label className={styles.fieldLabel} htmlFor="support-subject">
                Topic
              </label>
              <select
                id="support-subject"
                className={styles.fullSelect}
                value={supportSubject}
                onChange={(event) => setSupportSubject(event.target.value)}
              >
                <option>Booking question</option>
                <option>Wallet question</option>
                <option>Astrologer consultation</option>
                <option>Technical issue</option>
                <option>Other</option>
              </select>

              <label className={styles.fieldLabel} htmlFor="support-message">
                Message
              </label>
              <textarea
                id="support-message"
                className={styles.supportTextarea}
                rows={4}
                maxLength={1000}
                value={supportMessage}
                onChange={(event) => setSupportMessage(event.target.value)}
                placeholder="Describe how we can help..."
              />

              <small className={styles.characterCount}>
                {supportMessage.length}/1000 characters
              </small>

              <button type="submit" className={styles.button}>
                Prepare support request ↗
              </button>

              {supportNotice && (
                <p className={styles.inlineNotice}>{supportNotice}</p>
              )}

              <p className={styles.inlineNotice}>
                Topic: {supportSubject}. This form does not send a real support ticket.
              </p>
            </form>
          </div>
        )}

        <div className={styles.notice}>
          <strong>Frontend demo</strong>
          <p>
            These pages use sample data and local page state. Real bookings,
            payments, horoscope services, notifications and support tickets
            require backend/API integration.
          </p>
        </div>

        <Link href="/customer" className={styles.button}>
          ← Back to Dashboard
        </Link>
      </section>
    </main>
  );
}
