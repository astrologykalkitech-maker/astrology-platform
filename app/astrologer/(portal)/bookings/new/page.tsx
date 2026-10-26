use client;

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { buttonStyles } from "@/components/astrologer/ui/Button";

export const metadata = {
  title: "Create Booking | JyotishSetu",
  description: "Schedule a new consultation booking for a customer.",
};

export default function NewBookingPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    customer_id: "",
    service_type: "",
    consultation_mode: "Video",
    scheduled_at: "",
    duration_minutes: 30,
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: name === "duration_minutes" ? Number(value) : value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/astrologer/create-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create booking");
      }
      // Redirect to bookings list on success
      router.replace("/astrologer/bookings");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href="/astrologer/dashboard"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-white text-gold-deep hover:bg-parchment transition-colors"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <CardTitle>Create Booking</CardTitle>
          <p className="text-xs text-muted">Schedule a new consultation for a customer.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gold/25 bg-white p-6 shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)]">
        {error && (
          <div className="rounded-md bg-rose-100 p-3 text-rose-800">{error}</div>
        )}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-midnight">Customer ID</span>
            <input
              name="customer_id"
              type="text"
              required
              value={form.customer_id}
              onChange={handleChange}
              className="rounded border border-line bg-white px-3 py-2 text-midnight focus:outline-none focus:ring-2 focus:ring-gold"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-midnight">Service Type</span>
            <input
              name="service_type"
              type="text"
              required
              value={form.service_type}
              onChange={handleChange}
              className="rounded border border-line bg-white px-3 py-2 text-midnight focus:outline-none focus:ring-2 focus:ring-gold"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-midnight">Mode</span>
            <select
              name="consultation_mode"
              value={form.consultation_mode}
              onChange={handleChange}
              className="rounded border border-line bg-white px-3 py-2 text-midnight focus:outline-none focus:ring-2 focus:ring-gold"
            >
              <option value="Video">Video</option>
              <option value="Voice">Voice</option>
              <option value="Chat">Chat</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-midnight">Duration (minutes)</span>
            <input
              name="duration_minutes"
              type="number"
              min={5}
              value={form.duration_minutes}
              onChange={handleChange}
              className="rounded border border-line bg-white px-3 py-2 text-midnight focus:outline-none focus:ring-2 focus:ring-gold"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-midnight">Scheduled At</span>
          <input
            name="scheduled_at"
            type="datetime-local"
            required
            value={form.scheduled_at}
            onChange={handleChange}
            className="rounded border border-line bg-white px-3 py-2 text-midnight focus:outline-none focus:ring-2 focus:ring-gold"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-midnight">Notes (optional)</span>
          <textarea
            name="notes"
            rows={3}
            value={form.notes}
            onChange={handleChange}
            className="rounded border border-line bg-white px-3 py-2 text-midnight focus:outline-none focus:ring-2 focus:ring-gold"
          />
        </label>
        <div className="flex justify-end space-x-2">
          <Link
            href="/astrologer/bookings"
            className={buttonStyles({ variant: "outline", size: "sm" })}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className={buttonStyles({ variant: "default", size: "sm" })}
          >
            {loading ? "Creating..." : "Create Booking"}
          </button>
        </div>
      </form>
    </div>
  );
}
