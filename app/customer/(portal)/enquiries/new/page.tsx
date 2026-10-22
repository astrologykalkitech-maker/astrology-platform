"use client";

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import styles from '../../customer.module.css';

function NewEnquiryForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preFilledAstrologerId = searchParams.get('astrologerId') || "";
  const preFilledAstrologerName = searchParams.get('astrologerName') || "";

  const [enquiryMode, setEnquiryMode] = useState<"platform" | "direct">(() =>
    preFilledAstrologerId ? "direct" : "platform"
  );
  const [astrologerId, setAstrologerId] = useState(() => preFilledAstrologerId);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("medium");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const payload: Record<string, unknown> = {
        subject,
        message,
        priority,
        astrologer_id: enquiryMode === "direct" && astrologerId ? astrologerId : null,
      };

      const res = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      
      if (!res.ok) {
        throw new Error(json.error || "Failed to submit enquiry.");
      }
      
      router.push('/customer/enquiries');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit enquiry.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className={styles.cardHeader} style={{ borderBottom: 'none', marginBottom: '20px', paddingBottom: 0 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-cinzel)', margin: 0, fontSize: '24px', color: 'var(--text-dark)' }}>
            Ask for Guidance ✦
          </h1>
          <p style={{ margin: '5px 0 0 0', color: 'var(--text-muted)', fontSize: '13px' }}>
            Submit a question to our Vedic astrology panel or consult with a selected astrologer.
          </p>
        </div>
      </div>

      <div className={styles.card} style={{ maxWidth: '640px' }}>
        {/* Enquiry Destination Mode Toggle */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', background: '#f8fafc', padding: '6px', borderRadius: '10px' }}>
          <button
            type="button"
            onClick={() => {
              setEnquiryMode("platform");
              setAstrologerId("");
            }}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px',
              transition: '0.2s',
              background: enquiryMode === "platform" ? 'var(--gold)' : 'transparent',
              color: enquiryMode === "platform" ? '#fff' : 'var(--text-dark)',
            }}
          >
            <i className="fa-solid fa-users" style={{ marginRight: '8px' }}></i> Ask the Platform
          </button>
          <button
            type="button"
            onClick={() => setEnquiryMode("direct")}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px',
              transition: '0.2s',
              background: enquiryMode === "direct" ? 'var(--gold)' : 'transparent',
              color: enquiryMode === "direct" ? '#fff' : 'var(--text-dark)',
            }}
          >
            <i className="fa-solid fa-user-astronaut" style={{ marginRight: '8px' }}></i> Specific Astrologer
          </button>
        </div>

        {error && (
          <div style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '8px', marginBottom: '18px', fontSize: '13px' }}>
            <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: '8px' }}></i> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {enquiryMode === "direct" && (
            <div className={styles.formGroup}>
              <label>Target Astrologer</label>
              {preFilledAstrologerName ? (
                <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '13px', color: '#166534', marginBottom: '8px' }}>
                  <i className="fa-solid fa-check" style={{ marginRight: '6px' }}></i> Consulting with <strong>{preFilledAstrologerName}</strong>
                </div>
              ) : (
                <div style={{ marginBottom: '8px' }}>
                  <input 
                    type="text" 
                    value={astrologerId} 
                    onChange={(e) => setAstrologerId(e.target.value)} 
                    placeholder="Astrologer UUID (e.g. from astrologer directory)"
                    required={enquiryMode === "direct"}
                  />
                  <small style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    Tip: You can also choose an astrologer directly from the <Link href="/customer/astrologers" style={{ color: 'var(--gold)' }}>Astrologer Directory</Link>.
                  </small>
                </div>
              )}
            </div>
          )}

          {enquiryMode === "platform" && (
            <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', fontSize: '13px', color: '#1e40af', marginBottom: '18px' }}>
              <i className="fa-solid fa-circle-info" style={{ marginRight: '6px' }}></i> <strong>Platform Enquiry:</strong> Your question will be reviewed by our central panel and routed to the most suited certified astrologer.
            </div>
          )}

          <div className={styles.formGroup}>
            <label>Subject / Topic</label>
            <input 
              type="text" 
              value={subject} 
              onChange={(e) => setSubject(e.target.value)} 
              placeholder="e.g. Career transition timing or Kundli compatibility" 
              maxLength={200}
              required 
            />
          </div>

          <div className={styles.formGroup}>
            <label>Urgency Level</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '14px',
                background: '#fff',
                color: '#333',
              }}
            >
              <option value="low">Low — General inquiry</option>
              <option value="medium">Medium — Standard guidance (Recommended)</option>
              <option value="high">High — Important life decision</option>
              <option value="urgent">Urgent — Immediate concern</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Your Question & Details</label>
            <textarea 
              value={message} 
              onChange={(e) => setMessage(e.target.value)} 
              placeholder="Provide birth details (Date, Time, Place of birth) and your detailed question for accurate Vedic analysis..." 
              rows={6} 
              maxLength={5000}
              required 
            />
            <small style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              Max 5,000 characters.
            </small>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button type="submit" className={styles.btnGold} disabled={loading} style={{ flex: 1, justifyContent: 'center' }}>
              {loading ? (
                <span><i className="fa-solid fa-spinner fa-spin"></i> Submitting...</span>
              ) : (
                <span><i className="fa-solid fa-paper-plane"></i> Submit Enquiry</span>
              )}
            </button>
            <Link
              href="/customer/enquiries"
              className={styles.btnGold}
              style={{
                flex: 1,
                justifyContent: 'center',
                background: '#fff',
                color: 'var(--gold)',
                border: '1px solid var(--gold)',
              }}
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}

export default function NewEnquiryPage() {
  return (
    <Suspense fallback={<p style={{ padding: 20 }}>Loading enquiry form...</p>}>
      <NewEnquiryForm />
    </Suspense>
  );
}