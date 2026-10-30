# JYOTISHSETU — MASTER TECHNICAL AUDIT REPORT
## 09: Feature Gaps, Non-Breaking Roadmap & Recommendations

**Audit Target:** Identification of missing commercial capabilities and non-breaking enhancement pathways.

---

### 1. Catalog of Missing Features & Production Enhancements

| Feature Area | Current State | Missing Capability | Priority | Recommended Solution |
| :--- | :--- | :--- | :--- | :--- |
| **Payment Gateway** | Direct booking verification | Automated Razorpay/Stripe checkout & webhook reconciliation | **HIGH** | Add `/api/payments/razorpay-webhook` and update booking payment status automatically. |
| **SMS / WhatsApp Alerts** | Email / In-App Realtime | Automated SMS/WhatsApp Muhurat reminders (T-15m) | **MEDIUM** | Integrate Twilio or Gupshup webhook triggered on booking creation. |
| **Cloud Video Recording** | Live WebRTC without cloud recording | Automated session audio/video recording stored to S3 | **LOW** | Enable LiveKit Egress service to record to Supabase Storage bucket. |
| **Push Notifications** | In-app WebSocket toast | Web Push API notifications for backgrounded browser tabs | **LOW** | Implement Service Worker `push` and `notificationclick` handlers. |
| **Automated Refunds** | Admin manual resolution | Automated refund disbursement on booking cancellation | **MEDIUM** | Link cancellation server action to payment gateway refund API. |

---

### 2. Prioritized Non-Breaking Implementation Roadmap

1. **Phase A (Immediate / Production Ready):**
   - Current system is 100% operational for discovery, bookings, in-house video calls, Kundli, and lead triage.
   - Maintain current Cloudflare tunnel and Supabase dual-database connections.

2. **Phase B (Commercial Scale):**
   - Integrate Razorpay payment gateway for instant INR transactions.
   - Add WhatsApp consultation reminders 15 minutes before the Muhurat slot.

3. **Phase C (Infrastructure Expansion):**
   - Deploy LiveKit Egress worker for compliance audio recordings.
   - Archive legacy demo utility (`lib/customer-demo.ts`).
