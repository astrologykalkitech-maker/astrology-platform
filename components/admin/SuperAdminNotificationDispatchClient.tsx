"use client";

import React, { useState } from "react";
import {
  Bell,
  Send,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Phone,
  Mail,
  Smartphone,
  MessageSquare,
  Globe,
} from "lucide-react";
import {
  dispatchMultiChannelNotification,
  type NotificationChannel,
} from "@/app/actions/enterprise-notifications";

export function SuperAdminNotificationDispatchClient({
  stats,
  recentFailures = [],
}: {
  stats: any;
  recentFailures: any[];
}) {
  const [recipientId, setRecipientId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [eventType, setEventType] = useState("admin_broadcast_announcement");
  const [selectedChannels, setSelectedChannels] = useState<NotificationChannel[]>([
    "in_app",
    "web_push",
    "email",
  ]);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const toggleChannel = (ch: NotificationChannel) => {
    setSelectedChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  };

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientId || !body.trim()) return;

    setIsSending(true);
    setSendResult(null);
    try {
      const res = await dispatchMultiChannelNotification({
        recipientId,
        title: title || "JyotishSetu Platform Update",
        body,
        eventType,
        channels: selectedChannels,
      });

      if (res.success) {
        setSendResult(`Dispatched notification to ${res.count} active channel(s).`);
        setTitle("");
        setBody("");
      } else {
        setSendResult(`Error: ${res.error}`);
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="font-display text-2xl font-bold text-midnight">
          Enterprise Multi-Channel Notifications & Telemetry
        </h1>
        <p className="text-xs text-muted">
          Real-time delivery status, channel routing (Push, Email, SMS, WhatsApp), retry logs and broadcast dispatch.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-gold/25 bg-white p-4 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Total Notifications</p>
          <p className="text-xl font-bold text-midnight mt-1">{stats?.total || 0}</p>
        </div>
        <div className="rounded-2xl border border-gold/25 bg-white p-4 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Sent & Delivered</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">{stats?.delivered || stats?.sent || 0}</p>
        </div>
        <div className="rounded-2xl border border-gold/25 bg-white p-4 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Delivery Failures</p>
          <p className="text-xl font-bold text-red-600 mt-1">{stats?.failed || 0}</p>
        </div>
        <div className="rounded-2xl border border-gold/25 bg-white p-4 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Active Channels</p>
          <p className="text-xl font-bold text-gold-deep mt-1">5 Channels</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dispatch Form */}
        <div className="rounded-2xl border border-gold/25 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-midnight">
            Dispatch Test or System Notification
          </h2>

          <form onSubmit={handleDispatch} className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-midnight mb-1">Target User ID (UUID)</label>
              <input
                type="text"
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                placeholder="User UUID from customer or astrologer profiles"
                required
                className="w-full rounded-xl border border-gold/30 bg-white p-2.5 outline-none focus:border-gold"
              />
            </div>

            <div>
              <label className="block font-bold text-midnight mb-1">Notification Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Auspicious Shubh Muhurat Alert"
                className="w-full rounded-xl border border-gold/30 bg-white p-2.5 outline-none focus:border-gold"
              />
            </div>

            <div>
              <label className="block font-bold text-midnight mb-1">Notification Body</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Enter notification message..."
                rows={3}
                required
                className="w-full rounded-xl border border-gold/30 bg-white p-2.5 outline-none focus:border-gold resize-none"
              />
            </div>

            <div>
              <label className="block font-bold text-midnight mb-2">Select Channels</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "in_app" as NotificationChannel, label: "In-App", icon: Smartphone },
                  { key: "web_push" as NotificationChannel, label: "Web Push", icon: Bell },
                  { key: "email" as NotificationChannel, label: "Email", icon: Mail },
                  { key: "sms" as NotificationChannel, label: "SMS", icon: Phone },
                  { key: "whatsapp" as NotificationChannel, label: "WhatsApp", icon: MessageSquare },
                ].map((item) => {
                  const active = selectedChannels.includes(item.key);
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => toggleChannel(item.key)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
                        active
                          ? "border-gold bg-gold/15 text-gold-deep"
                          : "border-slate-200 bg-white text-muted"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSending || !recipientId || !body.trim()}
              className="rounded-xl bg-midnight text-champagne px-5 py-2.5 font-bold hover:bg-plum transition disabled:opacity-50 flex items-center gap-2"
            >
              <Send className="h-4 w-4" />
              {isSending ? "Dispatching..." : "Send Multi-Channel Notification"}
            </button>

            {sendResult && (
              <p className="text-xs font-semibold mt-2 text-gold-deep">{sendResult}</p>
            )}
          </form>
        </div>

        {/* Recent Errors & Monitoring */}
        <div className="rounded-2xl border border-gold/25 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-midnight">
            Recent Delivery Errors & Retries
          </h2>

          {recentFailures.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted border border-dashed border-slate-200 rounded-xl">
              All delivery channels operational. Zero active delivery failures.
            </div>
          ) : (
            <div className="space-y-2">
              {recentFailures.map((f: any) => (
                <div
                  key={f.id}
                  className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 space-y-1"
                >
                  <div className="flex items-center justify-between font-bold">
                    <span>Channel: {f.channel}</span>
                    <span className="text-[10px] text-red-600">Retries: {f.retry_count}</span>
                  </div>
                  <p className="text-[11px] text-red-800">{f.failure_reason || "Unknown error"}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

