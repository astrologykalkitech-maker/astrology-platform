"use client";

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import styles from '../../customer.module.css';

function NewEnquiryForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preFilledAstrologerId = searchParams.get('astrologerId') || "";

  const [astrologerId, setAstrologerId] = useState(preFilledAstrologerId);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ astrologer_id: astrologerId, subject, message }),
      });
      const json = await res.json();
      
      if (!res.ok) throw new Error(json.error || "Failed to submit");
      
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
        <h2 style={{ fontFamily: 'var(--font-cinzel)', margin: 0, fontSize: '24px', color: 'var(--text-dark)' }}>Create New Enquiry</h2>
      </div>

      <div className={styles.card} style={{ maxWidth: '600px' }}>
        {error && <div style={{ padding: '10px', background: '#ffebee', color: '#c62828', borderRadius: '8px', marginBottom: '15px', fontSize: '13px' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label>Astrologer ID (UUID)</label>
            <input 
              type="text" 
              value={astrologerId} 
              onChange={(e) => setAstrologerId(e.target.value)} 
              placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
              required 
              readOnly={!!preFilledAstrologerId}
              style={{ background: preFilledAstrologerId ? '#f5f5f5' : '#fff', color: '#333' }}
            />
            <small style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px', display: 'block' }}>
              {preFilledAstrologerId ? "Auto-filled from astrologer profile." : "Paste the astrologer's ID here."}
            </small>
          </div>

          <div className={styles.formGroup}>
            <label>Subject</label>
            <input 
              type="text" 
              value={subject} 
              onChange={(e) => setSubject(e.target.value)} 
              placeholder="e.g. Career guidance" 
              required 
            />
          </div>

          <div className={styles.formGroup}>
            <label>Your Question</label>
            <textarea 
              value={message} 
              onChange={(e) => setMessage(e.target.value)} 
              placeholder="Write your detailed question here..." 
              rows={5} 
              required 
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button type="submit" className={styles.btnGold} disabled={loading} style={{ flex: 1 }}>
              {loading ? "Submitting..." : "Submit Enquiry"}
            </button>
            <Link href="/customer/enquiries" className={styles.btnGold} style={{ flex: 1, justifyContent: 'center', background: '#fff', color: 'var(--gold)', border: '1px solid var(--gold)' }}>
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
    <Suspense fallback={<p style={{ padding: 20 }}>Loading form...</p>}>
      <NewEnquiryForm />
    </Suspense>
  );
}