"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import styles from "./customer.module.css";

type EnquiryStatus = "All" | "Pending" | "Assigned" | "Completed";
type Enquiry = {
  id: string;
  category: string;
  status: Exclude<EnquiryStatus, "All">;
  date: string;
  question: string;
  fullName: string;
  phone: string;
};

type CustomerReview = {
  id: string;
  enquiryId: string;
  rating: number;
  text: string;
  date: string;
};

const STORAGE_KEY = "astroconnect-customer-demo-v1";

const initialEnquiries: Enquiry[] = [
  {
    id: "ENQ-103",
    category: "Career & Profession",
    status: "Pending",
    date: "14 Oct 2026",
    question: "Guidance for my career growth",
    fullName: "Dolly Vishwakarma",
    phone: "••••••••42",
  },
  {
    id: "ENQ-102",
    category: "Love & Relationships",
    status: "Assigned",
    date: "12 Oct 2026",
    question: "Relationship compatibility guidance",
    fullName: "Dolly Vishwakarma",
    phone: "••••••••42",
  },
  {
    id: "ENQ-101",
    category: "Health & Wellness",
    status: "Completed",
    date: "09 Oct 2026",
    question: "Guidance for peace of mind",
    fullName: "Dolly Vishwakarma",
    phone: "••••••••42",
  },
];
type DashboardPage =
  | "Dashboard"
  | "New Enquiry"
  | "My Enquiries"
  | "Enquiry Details"
  | "Reviews"
  | "Settings";
type StatTone = "purple" | "orange" | "blue" | "green";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEnquiry(value: unknown): value is Enquiry {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.category === "string" &&
    (value.status === "Pending" ||
      value.status === "Assigned" ||
      value.status === "Completed") &&
    typeof value.date === "string" &&
    typeof value.question === "string" &&
    typeof value.fullName === "string" &&
    typeof value.phone === "string"
  );
}

function isCustomerReview(value: unknown): value is CustomerReview {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.enquiryId === "string" &&
    typeof value.rating === "number" &&
    value.rating >= 1 &&
    value.rating <= 5 &&
    typeof value.text === "string" &&
    typeof value.date === "string"
  );
}

const navItems: { label: DashboardPage; icon: string }[] = [
  { label: "Dashboard", icon: "⌂" },
  { label: "New Enquiry", icon: "✧" },
  { label: "My Enquiries", icon: "▤" },
  { label: "Reviews", icon: "☆" },
  { label: "Settings", icon: "⚙" },
];

const extraNavItems = [
  { label: "Find Astrologers", href: "/customer/astrologers", icon: "✦" },
  { label: "My Bookings", href: "/customer/bookings", icon: "◷" },
  { label: "My Wallet", href: "/customer/wallets", icon: "₹" },
  { label: "Daily Horoscope", href: "/customer/horoscope", icon: "☼" },
  { label: "Notifications", href: "/customer/notification", icon: "♧" },
  { label: "Help & Support", href: "/customer/help", icon: "?" },
];

export default function CustomerDashboard() {
  const [active, setActive] = useState<DashboardPage>("Dashboard");
  const [enquiries, setEnquiries] = useState<Enquiry[]>(initialEnquiries);
  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<EnquiryStatus>("All");
  const [category, setCategory] = useState("Career & Profession");
  const [question, setQuestion] = useState("");
  const [notice, setNotice] = useState("");
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [reviewEnquiryId, setReviewEnquiryId] = useState("ENQ-101");
  const [fullName, setFullName] = useState("Dolly Vishwakarma");
  const [email, setEmail] = useState("dolly@example.com");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState("English");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (!isRecord(parsed)) {
            throw new Error("Saved customer demo data has an invalid format.");
          }

          if (Array.isArray(parsed.enquiries)) {
            if (!parsed.enquiries.every(isEnquiry)) {
              throw new Error("Saved customer enquiries have an invalid format.");
            }
            setEnquiries(parsed.enquiries);
          }

          if (Array.isArray(parsed.reviews)) {
            if (!parsed.reviews.every(isCustomerReview)) {
              throw new Error("Saved customer reviews have an invalid format.");
            }
            setReviews(parsed.reviews);
          }

          if (typeof parsed.fullName === "string") setFullName(parsed.fullName);
          if (typeof parsed.email === "string") setEmail(parsed.email);
          if (typeof parsed.phone === "string") setPhone(parsed.phone);
          if (typeof parsed.language === "string") setLanguage(parsed.language);
        }
      } catch (error) {
        console.error("Unable to restore customer demo data:", error);
        setNotice("Saved demo data could not be loaded. You can continue using this page.");
      } finally {
        setStorageReady(true);
      }
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, []);

  useEffect(() => {
    if (!storageReady) return;

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ enquiries, reviews, fullName, email, phone, language }),
      );
    } catch (error) {
      console.error("Unable to save customer demo data:", error);
      window.setTimeout(() => {
        setNotice("Browser storage is unavailable. Your changes will not persist after closing this page.");
      }, 0);
    }
  }, [email, enquiries, fullName, language, phone, reviews, storageReady]);

  const filteredEnquiries = useMemo(() => {
    const query = search.trim().toLowerCase();

    return enquiries.filter((item) => {
      const matchesStatus = filter === "All" || item.status === filter;
      const searchableText =
        `${item.id} ${item.category} ${item.question} ${item.status}`.toLowerCase();

      return matchesStatus && searchableText.includes(query);
    });
  }, [enquiries, filter, search]);

  const pendingCount = enquiries.filter(
    (item) => item.status === "Pending",
  ).length;
  const assignedCount = enquiries.filter(
    (item) => item.status === "Assigned",
  ).length;
  const completedCount = enquiries.filter(
    (item) => item.status === "Completed",
  ).length;

  function changePage(page: DashboardPage) {
    setActive(page);
    setNotice("");
    setMobileMenuOpen(false);
  }

  function createEnquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuestion = question.trim();

    if (!trimmedQuestion) {
      setNotice("Please enter your question first.");
      return;
    }

    if (trimmedQuestion.length < 10) {
      setNotice("Please enter at least 10 characters for your question.");
      return;
    }

    const highestId = enquiries.reduce((highest, item) => {
      const number = Number(item.id.replace("ENQ-", ""));
      return Number.isFinite(number) ? Math.max(highest, number) : highest;
    }, 100);

    const newEnquiry: Enquiry = {
      id: `ENQ-${highestId + 1}`,
      category,
      status: "Pending",
      date: new Date().toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      question: trimmedQuestion,
      fullName: fullName.trim(),
      phone: phone.trim(),
    };

    setEnquiries((previous) => [newEnquiry, ...previous]);
    setSelectedEnquiry(null);
    setQuestion("");
    setSearch("");
    setFilter("All");
    setActive("My Enquiries");
    setNotice(
      `${newEnquiry.id} created in this demo. It has not been saved to the database.`,
    );
  }

  function viewEnquiry(id: string) {
    const selected = enquiries.find((item) => item.id === id);

    if (!selected) {
      setNotice("Enquiry not found.");
      return;
    }

    setSelectedEnquiry(selected);
    setNotice("");
    setActive("Enquiry Details");
  }

  function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (rating === 0) {
      setNotice("Please select a rating before submitting.");
      return;
    }

    if (!enquiries.some(
      (item) => item.id === reviewEnquiryId && item.status === "Completed",
    )) {
      setNotice("Please select a completed enquiry to review.");
      return;
    }

    if (review.trim().length < 5) {
      setNotice("Please write at least 5 characters in your review.");
      return;
    }

    const submittedReview: CustomerReview = {
      id: `${reviewEnquiryId}-${Date.now()}`,
      enquiryId: reviewEnquiryId,
      rating,
      text: review.trim(),
      date: new Date().toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
    };
    setReviews((previous) => [submittedReview, ...previous]);
    setNotice(
      `Thank you for your ${rating}-star review for ${reviewEnquiryId}! It is saved in this browser only, not sent to a server.`,
    );
    setReview("");
    setRating(0);
  }

  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!fullName.trim()) {
      setNotice("Please enter your full name.");
      return;
    }

    setNotice("Settings saved in this browser only. They are not sent to a server.");
  }

  return (
    <main className={styles.layout}>
      <aside
        className={`${styles.sidebar} ${
          mobileMenuOpen ? styles.sidebarOpen : ""
        }`}
      >
        <button
          type="button"
          className={styles.brand}
          onClick={() => changePage("Dashboard")}
          aria-label="Go to dashboard"
        >
          <span className={styles.logo}>✦</span>
          <span className={styles.brandText}>
            <b>AstroConnect</b>
            <small>Your cosmic guide</small>
          </span>
        </button>

        <p className={styles.navLabel}>CUSTOMER MENU</p>

        <nav className={styles.navigation} aria-label="Customer menu">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.label}
              className={`${styles.navItem} ${
                active === item.label ? styles.active : ""
              }`}
              onClick={() => changePage(item.label)}
              aria-current={active === item.label ? "page" : undefined}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
              {item.label === "My Enquiries" && (
                <small className={styles.navCount}>{enquiries.length}</small>
              )}
            </button>
          ))}
        </nav>

        <div className={styles.extraNavigation}>
          <p className={styles.navLabel}>EXPLORE MORE</p>
          {extraNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={styles.navItem}
              onClick={() => setMobileMenuOpen(false)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        <div className={styles.sidebarBottom}>
          <div className={styles.quote}>
            <span>☾</span>
            <p>Trust the timing of your journey.</p>
            <small>Every question matters ✨</small>
          </div>

          <button
            type="button"
            className={styles.navItem}
            onClick={() => changePage("Dashboard")}
          >
            <span className={styles.navIcon}>↩</span>
            <span>Back to dashboard</span>
          </button>
          <Link
            href="/customer/login"
            className={styles.navItem}
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className={styles.navIcon}>⇥</span>
            <span>Sign in / Sign up</span>
          </Link>
        </div>
      </aside>

      {mobileMenuOpen && (
        <button
          type="button"
          className={styles.mobileOverlay}
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation menu"
        />
      )}

      <section className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button
              type="button"
              className={styles.menuToggle}
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label="Toggle navigation"
              aria-expanded={mobileMenuOpen}
            >
              ☰
            </button>
            <div>
              <small className={styles.breadcrumb}>
                Customer Portal / {active}
              </small>
              <p className={styles.topTitle}>{active}</p>
            </div>
          </div>

          <button
            type="button"
            className={styles.profile}
            onClick={() => changePage("Settings")}
            aria-label="Open account settings"
          >
            <span className={styles.avatar}>
              {fullName.trim().charAt(0).toUpperCase() || "D"}
            </span>
            <span className={styles.profileText}>
              <b>{fullName || "Customer"}</b>
              <small>Customer account</small>
            </span>
            <span className={styles.profileArrow}>⌄</span>
          </button>
        </header>

        <div className={styles.content}>
          {active === "Dashboard" && (
            <>
              <div className={styles.welcome}>
                <div>
                  <p className={styles.eyebrow}>
                    YOUR PERSONAL COSMIC SPACE
                  </p>
                  <h1>
                    Welcome back, {fullName.split(" ")[0] || "there"}{" "}
                    <span>✦</span>
                  </h1>
                  <p className={styles.muted}>
                    A little clarity can open a world of possibilities.
                  </p>
                </div>
                <span className={styles.datePill}>
                  ☼ Your journey, your pace
                </span>
              </div>

              <section className={styles.hero}>
                <div className={styles.heroText}>
                  <p className={styles.heroEyebrow}>
                    YOUR JOURNEY STARTS HERE
                  </p>
                  <h2>
                    Find clarity.
                    <br />
                    Discover your <em>path.</em>
                  </h2>
                  <p>
                    Share your questions and take the next step with
                    confidence.
                  </p>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => changePage("New Enquiry")}
                  >
                    Create New Enquiry <span>↗</span>
                  </button>
                </div>

                <div className={styles.cosmos} aria-hidden="true">
                  <div className={styles.orbit}>
                    <div className={styles.moon}>☾</div>
                  </div>
                  <span className={styles.star1}>✦</span>
                  <span className={styles.star2}>✧</span>
                  <span className={styles.star3}>✦</span>
                  <span className={styles.star4}>·</span>
                </div>
              </section>

              <div className={styles.sectionTitle}>
                <div>
                  <h2>Your enquiries at a glance</h2>
                  <p>Keep track of your guidance journey.</p>
                </div>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => changePage("My Enquiries")}
                >
                  View all ↗
                </button>
              </div>

              <div className={styles.stats}>
                <Stat
                  title="Total enquiries"
                  value={enquiries.length}
                  icon="▤"
                  tone="purple"
                />
                <Stat
                  title="Pending"
                  value={pendingCount}
                  icon="◷"
                  tone="orange"
                />
                <Stat
                  title="Assigned"
                  value={assignedCount}
                  icon="✧"
                  tone="blue"
                />
                <Stat
                  title="Completed"
                  value={completedCount}
                  icon="✓"
                  tone="green"
                />
              </div>

              <section className={styles.panel}>
                <div className={styles.panelHeading}>
                  <div>
                    <h2>Recent enquiries</h2>
                    <p>Your latest questions and their progress.</p>
                  </div>
                  <button
                    type="button"
                    className={styles.outlineButton}
                    onClick={() => changePage("New Enquiry")}
                  >
                    + New enquiry
                  </button>
                </div>

                <EnquiryTable
                  items={enquiries.slice(0, 4)}
                  onView={viewEnquiry}
                />
                {notice && <p className={styles.notice}>{notice}</p>}
              </section>

              <div className={styles.tip}>
                <span>✧</span>
                <div>
                  <b>A little reminder for you</b>
                  <p>
                    Every question is a step towards clarity. Take your time.
                  </p>
                </div>
                <span className={styles.tipMoon}>☾</span>
              </div>
            </>
          )}

          {active === "New Enquiry" && (
            <>
              <PageHeading
                title="Create a new enquiry"
                subtitle="Tell us what's on your mind. Every question deserves care."
              />

              <form className={styles.formPanel} onSubmit={createEnquiry}>
                <label className={styles.field}>
                  Consultation category
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                  >
                    <option>Career & Profession</option>
                    <option>Love & Relationships</option>
                    <option>Health & Wellness</option>
                    <option>Family & Personal Life</option>
                    <option>Finance</option>
                    <option>Education</option>
                    <option>Other</option>
                  </select>
                </label>

                <label className={styles.field}>
                  Your full name
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    autoComplete="name"
                    maxLength={100}
                    required
                  />
                </label>

                <label className={styles.field}>
                  Phone number
                  <input
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    autoComplete="tel"
                    inputMode="tel"
                    maxLength={20}
                    placeholder="Enter your phone number"
                    required
                  />
                </label>

                <label className={styles.field}>
                  Your question
                  <textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    rows={6}
                    maxLength={1000}
                    required
                    placeholder="Write your question here..."
                  />
                  <small className={styles.charCount}>
                    {question.length}/1000 characters
                  </small>
                </label>

                <p className={styles.formHint}>
                  ✦ Frontend demo: your enquiry is not sent to a server.
                </p>

                <button className={styles.primaryButton} type="submit">
                  Submit enquiry <span>↗</span>
                </button>
                {notice && <p className={styles.notice}>{notice}</p>}
              </form>
            </>
          )}

          {active === "My Enquiries" && (
            <>
              <PageHeading
                title="My enquiries"
                subtitle="View your questions and check their progress."
              />

              <section className={styles.panel}>
                <div className={styles.filters}>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by ID, category or question..."
                    aria-label="Search enquiries"
                  />

                  <div className={styles.filterGroup}>
                    {(
                      ["All", "Pending", "Assigned", "Completed"] as EnquiryStatus[]
                    ).map((status) => (
                      <button
                        type="button"
                        key={status}
                        className={
                          filter === status
                            ? styles.filterActive
                            : styles.filterButton
                        }
                        onClick={() => setFilter(status)}
                        aria-pressed={filter === status}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>

                <EnquiryTable
                  items={filteredEnquiries}
                  onView={viewEnquiry}
                />

                {notice && <p className={styles.notice}>{notice}</p>}
              </section>
            </>
          )}

          {active === "Enquiry Details" && (
            <>
              <PageHeading
                title="Enquiry details"
                subtitle="Follow the progress of your question."
              />

              {selectedEnquiry ? (
                <section className={styles.detailPanel}>
                  <div className={styles.detailHeader}>
                    <div>
                      <span className={styles.detailEyebrow}>ENQUIRY {selectedEnquiry.id}</span>
                      <h2>{selectedEnquiry.category}</h2>
                    </div>
                    <span
                      className={`${styles.status} ${
                        selectedEnquiry.status === "Completed"
                          ? styles.completed
                          : selectedEnquiry.status === "Assigned"
                            ? styles.assigned
                            : styles.pending
                      }`}
                    >
                      {selectedEnquiry.status}
                    </span>
                  </div>

                  <div className={styles.detailMetadata}>
                    <div>
                      <span>Submitted on</span>
                      <strong>{selectedEnquiry.date}</strong>
                    </div>
                    <div>
                      <span>Customer name</span>
                      <strong>{selectedEnquiry.fullName}</strong>
                    </div>
                    <div>
                      <span>Phone number</span>
                      <strong>{selectedEnquiry.phone}</strong>
                    </div>
                    <div>
                      <span>Assigned astrologer</span>
                      <strong>
                        {selectedEnquiry.status === "Pending"
                          ? "Not assigned yet"
                          : "AstroConnect astrologer"}
                      </strong>
                    </div>
                  </div>

                  <div className={styles.questionCard}>
                    <span>Your question</span>
                    <p>{selectedEnquiry.question}</p>
                  </div>

                  <div className={styles.progressTrack} aria-label={`Enquiry status: ${selectedEnquiry.status}`}>
                    {(["Submitted", "Assigned", "Completed"] as const).map((step, index) => {
                      const completedStep =
                        index === 0 ||
                        (index === 1 && selectedEnquiry.status !== "Pending") ||
                        (index === 2 && selectedEnquiry.status === "Completed");

                      return (
                        <div
                          className={`${styles.progressStep} ${
                            completedStep ? styles.progressStepDone : ""
                          }`}
                          key={step}
                        >
                          <span>{completedStep ? "✓" : index + 1}</span>
                          <small>{step}</small>
                        </div>
                      );
                    })}
                  </div>

                  <div className={styles.detailActions}>
                    <button
                      type="button"
                      className={styles.outlineButton}
                      onClick={() => changePage("My Enquiries")}
                    >
                      ← Back to enquiries
                    </button>
                    {selectedEnquiry.status === "Completed" && (
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => {
                          setReviewEnquiryId(selectedEnquiry.id);
                          changePage("Reviews");
                        }}
                      >
                        Write a review <span>↗</span>
                      </button>
                    )}
                  </div>

                  <p className={styles.formHint}>
                    Demo enquiry details only. Status updates and astrologer
                    assignments are not connected to a backend.
                  </p>
                </section>
              ) : (
                <section className={styles.panel}>
                  <p className={styles.muted}>Choose an enquiry from your list to view its details.</p>
                  <button
                    type="button"
                    className={styles.outlineButton}
                    onClick={() => changePage("My Enquiries")}
                  >
                    Back to enquiries
                  </button>
                </section>
              )}
            </>
          )}

          {active === "Reviews" && (
            <>
              <PageHeading
                title="Share your experience"
                subtitle="Your feedback helps us improve your journey."
              />

              <form className={styles.formPanel} onSubmit={submitReview}>
                <label className={styles.field}>
                  Select a completed enquiry
                  <select
                    value={reviewEnquiryId}
                    onChange={(event) => setReviewEnquiryId(event.target.value)}
                    required
                  >
                    <option value="">Choose an enquiry</option>
                    {enquiries
                      .filter((item) => item.status === "Completed")
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.id} · {item.category}
                        </option>
                      ))}
                  </select>
                </label>

                <fieldset className={styles.ratingFieldset}>
                  <legend>Select your rating</legend>
                  <div className={styles.stars}>
                    {[1, 2, 3, 4, 5].map((number) => (
                      <button
                        type="button"
                        key={number}
                        className={
                          number <= rating ? styles.starSelected : ""
                        }
                        onClick={() => {
                          setRating(number);
                          setNotice("");
                        }}
                        aria-label={`Rate ${number} out of 5`}
                        aria-pressed={rating === number}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <small className={styles.ratingHelp}>
                    {rating ? `${rating} out of 5 stars selected` : "Choose 1–5 stars"}
                  </small>
                </fieldset>

                <label className={styles.field}>
                  Your review
                  <textarea
                    rows={5}
                    maxLength={1000}
                    value={review}
                    onChange={(event) => setReview(event.target.value)}
                    required
                    placeholder="Tell us about your experience..."
                  />
                  <small className={styles.charCount}>
                    {review.length}/1000 characters
                  </small>
                </label>

                <button className={styles.primaryButton} type="submit">
                  Submit review <span>↗</span>
                </button>
                {notice && <p className={styles.notice}>{notice}</p>}
              </form>

              <section className={styles.panel} aria-label="Recent reviews">
                <div className={styles.panelHeading}>
                  <div>
                    <h2>Recent reviews</h2>
                    <p>Your reviews saved in this browser.</p>
                  </div>
                </div>
                {reviews.length ? (
                  <div className={styles.tableWrap}>
                    <table>
                      <thead>
                        <tr>
                          <th>Enquiry</th>
                          <th>Rating</th>
                          <th>Your review</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reviews.map((item) => (
                          <tr key={item.id}>
                            <td className={styles.id}>{item.enquiryId}</td>
                            <td aria-label={`${item.rating} out of 5 stars`}>
                              {"★".repeat(item.rating)}{"☆".repeat(5 - item.rating)}
                            </td>
                            <td>{item.text}</td>
                            <td>{item.date}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className={styles.empty}>
                    <span>☆</span>
                    <h3>No reviews yet</h3>
                    <p>Your submitted reviews will appear here.</p>
                  </div>
                )}
              </section>
            </>
          )}

          {active === "Settings" && (
            <>
              <PageHeading
                title="Account settings"
                subtitle="Manage your customer profile preferences."
              />

              <form className={styles.formPanel} onSubmit={saveSettings}>
                <label className={styles.field}>
                  Full name
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                    maxLength={100}
                  />
                </label>

                <label className={styles.field}>
                  Email address
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </label>

                <label className={styles.field}>
                  Preferred language
                  <select
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                  >
                    <option>English</option>
                    <option>Hindi</option>
                  </select>
                </label>

                <label className={styles.field}>
                  Phone number
                  <input
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    autoComplete="tel"
                    maxLength={20}
                  />
                </label>

                <p className={styles.formHint}>
                  Changes are saved in this browser only. They are not sent to
                  your account or a server.
                </p>

                <button className={styles.primaryButton} type="submit">
                  Save changes <span>↗</span>
                </button>
                {notice && <p className={styles.notice}>{notice}</p>}
              </form>
            </>
          )}
        </div>

        <footer className={styles.footer}>
          <b>✦ AstroConnect</b>
          <span>Your questions, our guidance.</span>
          <span>Frontend preview · Demo data</span>
        </footer>
      </section>
    </main>
  );
}

function Stat({
  title,
  value,
  icon,
  tone,
}: {
  title: string;
  value: number;
  icon: string;
  tone: StatTone;
}) {
  const toneClass = {
    purple: styles.purple,
    orange: styles.orange,
    blue: styles.blue,
    green: styles.green,
  }[tone];

  return (
    <article className={styles.stat}>
      <span className={`${styles.statIcon} ${toneClass}`}>{icon}</span>
      <div>
        <small>{title}</small>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function PageHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className={styles.pageHeading}>
      <p className={styles.eyebrow}>ASTROCONNECT CUSTOMER SPACE</p>
      <h1>{title}</h1>
      <p className={styles.muted}>{subtitle}</p>
    </div>
  );
}

function EnquiryTable({
  items,
  onView,
}: {
  items: Enquiry[];
  onView: (id: string) => void;
}) {
  if (!items.length) {
    return (
      <div className={styles.empty}>
        <span>☾</span>
        <h3>No enquiries found</h3>
        <p>Try changing your search or filter.</p>
      </div>
    );
  }

  return (
    <div className={styles.tableWrap}>
      <table>
        <thead>
          <tr>
            <th>Enquiry ID</th>
            <th>Category and question</th>
            <th>Status</th>
            <th>Date</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const statusClass = {
              Pending: styles.pending,
              Assigned: styles.assigned,
              Completed: styles.completed,
            }[item.status];

            return (
              <tr key={item.id}>
                <td className={styles.id}>{item.id}</td>
                <td>
                  <b>{item.category}</b>
                  <small className={styles.questionPreview}>
                    {item.question}
                  </small>
                </td>
                <td>
                  <span className={`${styles.status} ${statusClass}`}>
                    {item.status}
                  </span>
                </td>
                <td>{item.date}</td>
                <td>
                  <button
                    type="button"
                    className={styles.viewButton}
                    onClick={() => onView(item.id)}
                  >
                    View ↗
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}