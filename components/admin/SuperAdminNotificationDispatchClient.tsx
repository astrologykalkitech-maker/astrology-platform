"use client";

import React, { useState, useMemo } from "react";
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
  Search,
  Users,
  CheckSquare,
  Square,
  X,
} from "lucide-react";
import {
  dispatchBulkMultiChannelNotification,
  type NotificationChannel,
  type AstrologerRecipientItem,
} from "@/app/actions/enterprise-notifications";

export function SuperAdminNotificationDispatchClient({
  stats,
  recentFailures = [],
  astrologers = [],
}: {
  stats: any;
  recentFailures: any[];
  astrologers?: AstrologerRecipientItem[];
}) {
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [targetMode, setTargetMode] = useState<"specific" | "all_eligible">("specific");

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

  // Filter astrologers dynamically by search query
  const filteredAstros = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return astrologers;
    return astrologers.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.userId.toLowerCase().includes(q)
    );
  }, [astrologers, searchQuery]);

  const toggleSelectAstrologer = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectAllFiltered = () => {
    const idsToAdd = filteredAstros.map((a) => a.userId);
    setSelectedUserIds((prev) => [...new Set([...prev, ...idsToAdd])]);
  };

  const handleClearSelection = () => {
    setSelectedUserIds([]);
  };

  const toggleChannel = (ch: NotificationChannel) => {
    setSelectedChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  };

  // Resolve recipients for dispatch
  const effectiveRecipientIds = useMemo(() => {
    if (targetMode === "all_eligible") {
      return astrologers.filter((a) => a.approvalStatus === "approved").map((a) => a.userId);
    }
    return selectedUserIds;
  }, [targetMode, selectedUserIds, astrologers]);

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveRecipientIds.length === 0) {
      alert("Please select at least one astrologer recipient or switch to All Eligible Astrologers.");
      return;
    }
    if (!body.trim()) return;

    const confirmMsg =
      targetMode === "all_eligible"
        ? `You are about to send this notification to ALL ${effectiveRecipientIds.length} approved astrologers via ${selectedChannels.length} channels. Proceed?`
        : `Send notification to ${effectiveRecipientIds.length} selected astrologer(s) via ${selectedChannels.length} channels?`;

    if (!window.confirm(confirmMsg)) return;

    setIsSending(true);
    setSendResult(null);
    try {
      const res = await dispatchBulkMultiChannelNotification({
        recipientUserIds: effectiveRecipientIds,
        title: title || "JyotishSetu Platform Update",
        body,
        eventType,
        channels: selectedChannels,
      });

      if (res.success) {
        setSendResult(
          `Dispatched successfully to ${res.totalRecipients} astrologer(s) across ${res.totalDeliveries} total channel deliveries.`
        );
        setTitle("");
        setBody("");
        if (targetMode === "specific") {
          setSelectedUserIds([]);
        }
      } else {
        setSendResult(`Dispatch error: ${res.error}`);
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
          Broadcast announcements, targeted alerts, and delivery telemetry across all registered astrologers.
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Recipient Selector (7 Cols) */}
        <div className="lg:col-span-7 rounded-2xl border border-gold/25 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-midnight flex items-center gap-1.5">
                <Users className="h-4 w-4 text-gold-deep" /> Astrologer Recipient Selection
              </h2>
              <p className="text-[11px] text-muted">
                Search and select individual astrologers or target all approved practitioners.
              </p>
            </div>

            {/* Mode Toggle */}
            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs">
              <button
                type="button"
                onClick={() => setTargetMode("specific")}
                className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  targetMode === "specific" ? "bg-white text-midnight shadow-xs" : "text-muted hover:text-midnight"
                }`}
              >
                Specific Astrologers
              </button>
              <button
                type="button"
                onClick={() => setTargetMode("all_eligible")}
                className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  targetMode === "all_eligible" ? "bg-white text-midnight shadow-xs" : "text-muted hover:text-midnight"
                }`}
              >
                All Eligible ({astrologers.filter((a) => a.approvalStatus === "approved").length})
              </button>
            </div>
          </div>

          {targetMode === "all_eligible" ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 font-bold">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Mode: Broadcast to All Approved Astrologers
              </div>
              <p className="text-emerald-700 leading-relaxed text-[11px]">
                This notification will automatically resolve and deliver to all{" "}
                <strong>{astrologers.filter((a) => a.approvalStatus === "approved").length} approved astrologers</strong>{" "}
                currently active on JyotishSetu.
              </p>
            </div>
          ) : (
            <>
              {/* Search & Bulk Control Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, email, or UUID..."
                    className="w-full rounded-xl border border-gold/30 bg-white pl-8 pr-8 py-2 text-xs outline-none focus:border-gold"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    data-lpignore="true"
                    data-form-type="other"
                    suppressHydrationWarning
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="px-2.5 py-2 rounded-xl border border-gold/30 bg-gold/10 text-xs font-semibold text-gold-deep hover:bg-gold/20 cursor-pointer"
                  >
                    Select All ({filteredAstros.length})
                  </button>
                  {selectedUserIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="px-2.5 py-2 rounded-xl border border-red-200 bg-red-50 text-xs font-semibold text-red-700 hover:bg-red-100 cursor-pointer"
                    >
                      Clear ({selectedUserIds.length})
                    </button>
                  )}
                </div>
              </div>

              {/* Selection Summary Pill */}
              <div className="flex items-center justify-between text-[11px] text-muted px-1">
                <span>
                  Showing {filteredAstros.length} of {astrologers.length} astrologers
                </span>
                <span className="font-bold text-midnight">
                  Selected: {selectedUserIds.length} recipient(s)
                </span>
              </div>

              {/* Astrologer Directory List */}
              <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100">
                {filteredAstros.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted">
                    No astrologers found matching &quot;{searchQuery}&quot;.
                  </div>
                ) : (
                  filteredAstros.map((a) => {
                    const isSelected = selectedUserIds.includes(a.userId);
                    return (
                      <div
                        key={a.id}
                        onClick={() => toggleSelectAstrologer(a.userId)}
                        className={`flex items-start justify-between p-3 rounded-xl cursor-pointer transition border ${
                          isSelected
                            ? "bg-gold/10 border-gold shadow-2xs"
                            : "hover:bg-slate-50 border-transparent"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="pt-0.5">
                            {isSelected ? (
                              <CheckSquare className="h-4 w-4 text-gold-deep" />
                            ) : (
                              <Square className="h-4 w-4 text-slate-300" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-xs text-midnight">{a.name}</span>
                              <span
                                className={`text-[9px] uppercase px-2 py-0.2 rounded-full font-bold ${
                                  a.approvalStatus === "approved"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-amber-50 text-amber-700 border border-amber-200"
                                }`}
                              >
                                {a.approvalStatus}
                              </span>
                              {a.experienceYears && (
                                <span className="text-[10px] text-muted">({a.experienceYears} yrs exp)</span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted font-mono mt-0.5">
                              Recipient Auth UUID: <span className="text-slate-700">{a.userId}</span>
                            </p>
                            <p className="text-[10px] text-muted font-mono">
                              Profile ID: <span className="text-slate-500">{a.id}</span>
                            </p>
                          </div>
                        </div>

                        <span className="text-[10px] text-muted font-mono shrink-0 pl-2">
                          {a.email}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        {/* Right: Message & Dispatch Panel (5 Cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-gold/25 bg-white p-5 shadow-xs space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-midnight flex items-center gap-1.5">
            <Bell className="h-4 w-4 text-gold-deep" /> Notification Content & Channels
          </h2>

          <form onSubmit={handleDispatch} className="space-y-3.5 text-xs">
            {/* Recipient Counter Badge */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-parchment/60 border border-gold/20">
              <span className="font-semibold text-midnight text-xs">Targeted Recipients:</span>
              <span className="font-bold text-xs px-2.5 py-0.5 rounded-full bg-gold text-midnight">
                {effectiveRecipientIds.length} Astrologer(s)
              </span>
            </div>

            <div>
              <label className="block font-bold text-midnight mb-1">Notification Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Auspicious Shubh Muhurat Announcement"
                className="w-full rounded-xl border border-gold/30 bg-white p-2.5 outline-none focus:border-gold"
              />
            </div>

            <div>
              <label className="block font-bold text-midnight mb-1">Notification Message *</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Enter notice, ritual update, or broadcast announcement..."
                rows={4}
                required
                className="w-full rounded-xl border border-gold/30 bg-white p-2.5 outline-none focus:border-gold resize-none"
              />
            </div>

            <div>
              <label className="block font-bold text-midnight mb-2">Delivery Channels</label>
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
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                        active
                          ? "bg-gold/20 border-gold text-gold-deep"
                          : "border-slate-200 bg-white text-muted hover:border-gold/30"
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
              disabled={isSending || effectiveRecipientIds.length === 0 || !body.trim()}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-midnight text-champagne py-3 text-xs font-bold hover:bg-plum transition disabled:opacity-50 cursor-pointer shadow-md"
            >
              {isSending ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin text-gold" /> Dispatching...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 text-gold" /> Send to {effectiveRecipientIds.length} Recipient(s)
                </>
              )}
            </button>

            {sendResult && (
              <div
                className={`p-3 rounded-xl border text-xs font-medium leading-relaxed ${
                  sendResult.startsWith("Dispatch error")
                    ? "bg-red-50 border-red-200 text-red-800"
                    : "bg-emerald-50 border-emerald-200 text-emerald-800"
                }`}
              >
                {sendResult}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Telemetry Section: Recent Delivery Logs */}
      <div className="rounded-2xl border border-gold/25 bg-white p-6 shadow-xs space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-midnight">
          Recent Delivery Telemetry & Telemetry Logs
        </h2>

        {recentFailures.length === 0 ? (
          <p className="text-xs text-muted">No recent failed deliveries recorded in telemetry audit log.</p>
        ) : (
          <div className="space-y-2">
            {recentFailures.map((f: any) => (
              <div
                key={f.id}
                className="flex items-center justify-between p-3 rounded-xl bg-red-50/50 border border-red-100 text-xs"
              >
                <div>
                  <span className="font-bold text-red-800 capitalize">
                    {f.channel} — {f.event_type}
                  </span>
                  <p className="text-[10px] text-muted">Recipient: {f.recipient_id}</p>
                </div>
                <span className="text-[10px] text-red-600 font-mono">
                  {f.failure_reason || "Connection Timeout"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}