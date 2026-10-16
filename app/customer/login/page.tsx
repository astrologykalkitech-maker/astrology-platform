"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import styles from "./login.module.css";

type AuthMode = "login" | "signup";

export default function CustomerLoginPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");

  function submitDemo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(
      mode === "login"
        ? "Demo only: authentication is not connected yet. Continue to the dashboard to explore."
        : "Demo only: your account has not been created. Continue to the dashboard to explore.",
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.visual} aria-label="AstroConnect introduction">
        <Link href="/customer/login" className={styles.brand}>
          <span className={styles.brandMark}>✦</span>
          <span>
            <strong>AstroConnect</strong>
            <small>Your Questions, Our Guidance</small>
          </span>
        </Link>

        <div className={styles.visualCopy}>
          <p className={styles.eyebrow}>A LITTLE CLARITY GOES A LONG WAY</p>
          <h1>
            Find clarity
            <br />
            in every <em>question.</em>
          </h1>
          <p className={styles.intro}>
            Connect with thoughtful astrologers and get guidance for the
            moments that matter to you.
          </p>

          <div className={styles.benefits}>
            <span><i>✧</i> Trusted astrologers</span>
            <span><i>☾</i> Personal guidance</span>
            <span><i>✦</i> Your journey, your pace</span>
          </div>
        </div>

        <div className={styles.celestialArt} aria-hidden="true">
          <div className={styles.sunHalo} />
          <div className={styles.mountainBack} />
          <div className={styles.mountainFront} />
          <div className={styles.artMoon}>☾</div>
          <span className={styles.artStarOne}>✦</span>
          <span className={styles.artStarTwo}>✧</span>
          <span className={styles.artStarThree}>·</span>
          <span className={styles.artStarFour}>✦</span>
        </div>

        <p className={styles.visualFooter}>A calmer space for life’s big questions.</p>
      </section>

      <section className={styles.formSide}>
        <div className={styles.authCard}>
          <div className={styles.mobileBrand}>
            <span className={styles.brandMark}>✦</span>
            <span>
              <strong>AstroConnect</strong>
              <small>Your Questions, Our Guidance</small>
            </span>
          </div>

          <div className={styles.tabs} role="tablist" aria-label="Account access">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? styles.activeTab : ""}
              onClick={() => {
                setMode("login");
                setNotice("");
              }}
            >
              Log in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signup"}
              className={mode === "signup" ? styles.activeTab : ""}
              onClick={() => {
                setMode("signup");
                setNotice("");
              }}
            >
              Sign up
            </button>
          </div>

          <p className={styles.formEyebrow}>YOUR COSMIC SPACE</p>
          <h2>{mode === "login" ? "Welcome Back" : "Create your account"}</h2>
          <p className={styles.formIntro}>
            {mode === "login"
              ? "Sign in to continue your personal journey."
              : "Join AstroConnect and find guidance for your questions."}
          </p>

          <form className={styles.form} onSubmit={submitDemo}>
            {mode === "signup" && (
              <label>
                Full name
                <input
                  name="name"
                  autoComplete="name"
                  placeholder="Enter your full name"
                  required
                  maxLength={100}
                />
              </label>
            )}

            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </label>

            <label>
              Password
              <span className={styles.passwordWrap}>
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder="Enter your password"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className={styles.showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
            </label>

            {mode === "login" && (
              <div className={styles.formOptions}>
                <label className={styles.remember}>
                  <input type="checkbox" />
                  Remember me
                </label>
                <button
                  type="button"
                  className={styles.textLink}
                  onClick={() =>
                    setNotice("Password reset is not connected in this frontend demo.")
                  }
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button className={styles.submitButton} type="submit">
              {mode === "login" ? "Log in" : "Create account"} <span>↗</span>
            </button>
          </form>

          {notice && (
            <div className={styles.notice} role="status">
              <p>{notice}</p>
              <Link href="/customer" className={styles.dashboardLink}>
                Continue to dashboard
              </Link>
            </div>
          )}

          <div className={styles.divider}><span>or continue with</span></div>
          <Link href="/customer" className={styles.demoButton}>
            Explore the demo dashboard
          </Link>

          <p className={styles.legal}>
            Frontend preview only. Authentication and account creation are not
            connected yet.
          </p>
        </div>
      </section>
    </main>
  );
}
