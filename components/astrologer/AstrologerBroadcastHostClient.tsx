"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Radio,
  Users,
  Sparkles,
  Video,
  VideoOff,
  Mic,
  MicOff,
  RefreshCw,
  AlertCircle,
  StopCircle,
  MessageSquare,
  Send,
  Pin,
  Trash2,
  Calendar,
  Clock,
  History,
  ShieldAlert,
} from "lucide-react";
import { Room, RoomEvent, createLocalTracks, LocalVideoTrack, LocalAudioTrack } from "livekit-client";
import {
  createLiveBroadcast,
  confirmBroadcastLive,
  sendHostHeartbeat,
  endLiveBroadcast,
  getAuthoritativeBroadcastViewerCount,
  sendBroadcastComment,
  getBroadcastComments,
  moderateBroadcastComment,
  toggleBroadcastComments,
  scheduleBroadcast,
  getAstrologerBroadcastHistory,
  type BroadcastTokenResult,
  type BroadcastComment,
} from "@/app/actions/broadcast";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] p-6";

type StreamStatus =
  | "idle"
  | "preparing"
  | "requesting_permissions"
  | "connecting"
  | "connected"
  | "publishing"
  | "live"
  | "reconnecting"
  | "failed"
  | "ended";

export function AstrologerBroadcastHostClient({
  astrologerId,
  astrologerName,
  existingBroadcast,
}: {
  astrologerId: string;
  astrologerName: string;
  existingBroadcast: any | null;
}) {
  const [activeTab, setActiveTab] = useState<"golive" | "schedule" | "history">("golive");
  const [broadcast, setBroadcast] = useState<any | null>(existingBroadcast);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [topic, setTopic] = useState("Vedic Astrology");
  const [streamStatus, setStreamStatus] = useState<StreamStatus>(existingBroadcast ? "live" : "idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Schedule state
  const [scheduleTitle, setScheduleTitle] = useState("");
  const [scheduleTopic, setScheduleTopic] = useState("Vedic Astrology");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleDuration, setScheduleDuration] = useState("60");
  const [scheduleMsg, setScheduleMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // History state
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Media state
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [viewerCount, setViewerCount] = useState<number | null>(null);

  // Comments state
  const [comments, setComments] = useState<BroadcastComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [isSendingComment, setIsSendingComment] = useState(false);

  const videoContainerRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const localTracksRef = useRef<{ videoTrack?: LocalVideoTrack; audioTrack?: LocalAudioTrack }>({});
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Cleanup LiveKit room and local tracks
  const teardownMedia = useCallback(async () => {
    if (localTracksRef.current.videoTrack) {
      localTracksRef.current.videoTrack.stop();
      localTracksRef.current.videoTrack.detach();
    }
    if (localTracksRef.current.audioTrack) {
      localTracksRef.current.audioTrack.stop();
      localTracksRef.current.audioTrack.detach();
    }
    localTracksRef.current = {};

    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      void teardownMedia();
    };
  }, [teardownMedia]);

  // Periodic Authoritative Viewer Count Poller & Host Heartbeat
  useEffect(() => {
    if (!broadcast || streamStatus !== "live") return;

    const timer = setInterval(async () => {
      const res = await getAuthoritativeBroadcastViewerCount(broadcast.room_name);
      if (res.success && res.viewerCount !== null) {
        setViewerCount(res.viewerCount);
      }
      // Send host heartbeat
      void sendHostHeartbeat(broadcast.id);
    }, 5000);

    return () => clearInterval(timer);
  }, [broadcast, streamStatus]);

  // Live Comments Poller during active broadcast
  useEffect(() => {
    if (!broadcast || streamStatus !== "live") return;

    const fetchComments = async () => {
      const res = await getBroadcastComments(broadcast.id);
      if (res.success) {
        setComments(res.comments);
      }
    };

    void fetchComments();
    const interval = setInterval(fetchComments, 3500);
    return () => clearInterval(interval);
  }, [broadcast, streamStatus]);

  // Load history when tab opens
  useEffect(() => {
    if (activeTab === "history") {
      setLoadingHistory(true);
      void getAstrologerBroadcastHistory().then((res) => {
        if (res.success) setHistoryList(res.data);
        setLoadingHistory(false);
      });
    }
  }, [activeTab]);

  const handleStartLive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || loading) return;

    setLoading(true);
    setError(null);
    setStreamStatus("preparing");

    try {
      // 1. Create Broadcast Session & Get Host Token
      const res = await createLiveBroadcast({
        title: title.trim(),
        description: description.trim(),
        topic: topic.trim(),
      });

      if (!res.success || !res.broadcast || !res.tokenResult) {
        throw new Error(res.error || "Failed to initialize broadcast session.");
      }

      const activeBroadcast = res.broadcast;
      const tokenResult: BroadcastTokenResult = res.tokenResult;
      setBroadcast(activeBroadcast);

      // 2. Request Camera & Mic Permissions
      setStreamStatus("requesting_permissions");
      const tracks = await createLocalTracks({
        audio: true,
        video: {
          resolution: { width: 1280, height: 720 },
        },
      });

      const videoTrack = tracks.find((t) => t.kind === "video") as LocalVideoTrack | undefined;
      const audioTrack = tracks.find((t) => t.kind === "audio") as LocalAudioTrack | undefined;
      localTracksRef.current = { videoTrack, audioTrack };

      // Attach video to local monitor preview
      if (videoTrack && videoContainerRef.current) {
        videoContainerRef.current.innerHTML = "";
        const videoElement = videoTrack.attach();
        videoElement.className = "w-full h-full object-cover rounded-xl";
        videoElement.muted = true;
        videoContainerRef.current.appendChild(videoElement);
      }

      // 3. Connect to LiveKit Room
      setStreamStatus("connecting");
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      room.on(RoomEvent.Reconnecting, () => setStreamStatus("reconnecting"));
      room.on(RoomEvent.Reconnected, () => setStreamStatus("live"));
      room.on(RoomEvent.Disconnected, () => {
        setStreamStatus("ended");
        void teardownMedia();
      });

      await room.connect(tokenResult.serverUrl, tokenResult.token);
      setStreamStatus("connected");

      // 4. Publish Media Tracks to SFU
      setStreamStatus("publishing");
      if (videoTrack) {
        await room.localParticipant.publishTrack(videoTrack, { name: "camera" });
      }
      if (audioTrack) {
        await room.localParticipant.publishTrack(audioTrack, { name: "microphone" });
      }

      // 5. Confirm Broadcast is genuinely live
      await confirmBroadcastLive(activeBroadcast.id);
      setStreamStatus("live");
    } catch (err: any) {
      console.error("[BroadcastHost] Streaming startup failed:", err);
      setError(err.message || "Failed to establish live stream. Check camera/microphone permissions.");
      setStreamStatus("failed");
      await teardownMedia();
    } finally {
      setLoading(false);
    }
  };

  const handleEndLive = async () => {
    if (!broadcast) return;
    setLoading(true);
    try {
      await endLiveBroadcast(broadcast.id);
      await teardownMedia();
      setBroadcast(null);
      setStreamStatus("idle");
      setViewerCount(null);
      setComments([]);
    } catch (err: any) {
      setError(err.message || "Error ending broadcast.");
    } finally {
      setLoading(false);
    }
  };

  const toggleCamera = async () => {
    const vt = localTracksRef.current.videoTrack;
    if (vt) {
      if (isCameraOn) {
        await vt.mute();
        setIsCameraOn(false);
      } else {
        await vt.unmute();
        setIsCameraOn(true);
      }
    }
  };

  const toggleMic = async () => {
    const at = localTracksRef.current.audioTrack;
    if (at) {
      if (isMicOn) {
        await at.mute();
        setIsMicOn(false);
      } else {
        await at.unmute();
        setIsMicOn(true);
      }
    }
  };

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !broadcast || isSendingComment) return;

    setIsSendingComment(true);
    try {
      const res = await sendBroadcastComment({
        broadcastId: broadcast.id,
        comment: newComment.trim(),
      });
      if (res.success && res.comment) {
        setComments((prev) => [...prev, res.comment!]);
        setNewComment("");
        setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      }
    } finally {
      setIsSendingComment(false);
    }
  };

  const handleModerateComment = async (commentId: string, action: "pin" | "unpin" | "delete") => {
    const res = await moderateBroadcastComment({ commentId, action });
    if (res.success) {
      if (action === "delete") {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      } else {
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? { ...c, is_pinned: action === "pin" } : c))
        );
      }
    }
  };

  const handleToggleComments = async () => {
    if (!broadcast) return;
    const nextVal = !commentsEnabled;
    const res = await toggleBroadcastComments(broadcast.id, nextVal);
    if (res.success) setCommentsEnabled(nextVal);
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setScheduleMsg(null);
    if (!scheduleTitle.trim() || !scheduleDate || !scheduleTime) {
      setScheduleMsg({ type: "error", text: "Please enter title, date, and time." });
      return;
    }

    const scheduledIso = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
    const res = await scheduleBroadcast({
      title: scheduleTitle.trim(),
      topic: scheduleTopic,
      scheduledFor: scheduledIso,
      durationMinutes: parseInt(scheduleDuration, 10) || 60,
    });

    if (res.success) {
      setScheduleMsg({ type: "success", text: "Broadcast scheduled successfully! Followers will be alerted." });
      setScheduleTitle("");
      setScheduleDate("");
      setScheduleTime("");
    } else {
      setScheduleMsg({ type: "error", text: res.error || "Failed to schedule broadcast." });
    }
  };

  // If live, show Studio Interface with LiveKit Feed & Real-time Comments
  if (broadcast) {
    const pinnedComment = comments.find((c) => c.is_pinned);

    return (
      <div className="relative overflow-hidden rounded-2xl border-2 border-gold bg-midnight p-6 text-ivory shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-gold/20 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {streamStatus === "live" ? (
              <>
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                <span className="text-xs font-black tracking-widest text-red-400 uppercase">
                  TRANSMITTING LIVE
                </span>
              </>
            ) : streamStatus === "reconnecting" ? (
              <span className="text-xs font-bold text-amber-400">Reconnecting to LiveKit...</span>
            ) : (
              <span className="text-xs font-bold text-sky-400 capitalize">{streamStatus}...</span>
            )}
            <span className="text-xs text-ivory/60">• Topic: {broadcast.topic}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Camera / Mic Controls */}
            <button
              type="button"
              onClick={toggleCamera}
              className={`p-2 rounded-xl border text-xs font-bold transition cursor-pointer ${
                isCameraOn
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                  : "border-red-500/50 bg-red-500/10 text-red-300 hover:bg-red-500/20"
              }`}
              title={isCameraOn ? "Turn off camera" : "Turn on camera"}
            >
              {isCameraOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={toggleMic}
              className={`p-2 rounded-xl border text-xs font-bold transition cursor-pointer ${
                isMicOn
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                  : "border-red-500/50 bg-red-500/10 text-red-300 hover:bg-red-500/20"
              }`}
              title={isMicOn ? "Mute microphone" : "Unmute microphone"}
            >
              {isMicOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={handleEndLive}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 shadow disabled:opacity-50 cursor-pointer"
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <StopCircle className="h-4 w-4" />}
              End Broadcast
            </button>
          </div>
        </div>

        {/* Live Studio Grid: Video Monitor + Live Seeker Comments */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 my-6">
          {/* Main Video Viewport */}
          <div className="lg:col-span-2 aspect-video rounded-xl bg-black border border-gold/40 relative overflow-hidden flex items-center justify-center">
            <div ref={videoContainerRef} className="w-full h-full" />
            {(!isCameraOn || streamStatus !== "live") && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center p-4">
                <Radio className="h-12 w-12 text-gold animate-pulse mb-2" />
                <p className="text-sm font-bold text-champagne">{broadcast.title}</p>
                <p className="text-xs text-ivory/60 mt-1">
                  {streamStatus === "live" && !isCameraOn
                    ? "Camera is currently muted"
                    : `Status: ${streamStatus}`}
                </p>
              </div>
            )}
          </div>

          {/* Real-time Interaction & Comments Panel */}
          <div className="flex flex-col h-[340px] lg:h-auto rounded-xl border border-gold/25 bg-black/40 backdrop-blur-md p-4">
            <div className="flex items-center justify-between pb-2 border-b border-gold/20 mb-3">
              <span className="flex items-center gap-1.5 text-xs font-bold text-gold">
                <MessageSquare className="h-4 w-4" /> Live Q&A & Seeker Chat
              </span>
              <button
                type="button"
                onClick={handleToggleComments}
                className="text-[11px] text-ivory/60 hover:text-ivory underline cursor-pointer"
              >
                {commentsEnabled ? "Disable" : "Enable"}
              </button>
            </div>

            {pinnedComment && (
              <div className="mb-2 p-2 rounded-lg bg-gold/15 border border-gold/30 flex items-center justify-between text-xs text-champagne">
                <div className="flex items-center gap-1.5 truncate">
                  <Pin className="h-3 w-3 text-gold shrink-0 rotate-45" />
                  <span className="font-bold text-[11px]">{pinnedComment.sender_name}:</span>
                  <span className="truncate text-[11px]">{pinnedComment.comment}</span>
                </div>
                <button
                  onClick={() => handleModerateComment(pinnedComment.id, "unpin")}
                  className="text-[10px] text-ivory/60 hover:text-ivory ml-2 shrink-0 cursor-pointer"
                >
                  Unpin
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
              {comments.length === 0 ? (
                <div className="h-full flex items-center justify-center text-ivory/40 text-[11px] text-center">
                  Seekers will post questions and astrological charts here as you speak.
                </div>
              ) : (
                comments.map((c) => (
                  <div
                    key={c.id}
                    className={`group p-2 rounded-lg border text-left transition ${
                      c.sender_role === "astrologer"
                        ? "bg-gold/15 border-gold/40 text-gold-deep"
                        : "bg-white/5 border-white/10 text-ivory"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-ivory/60 mb-1">
                      <span className="font-bold text-champagne">{c.sender_name}</span>
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition">
                        {!c.is_pinned && (
                          <button
                            onClick={() => handleModerateComment(c.id, "pin")}
                            className="text-ivory/60 hover:text-gold cursor-pointer"
                            title="Pin comment"
                          >
                            <Pin className="h-3 w-3 rotate-45" />
                          </button>
                        )}
                        <button
                          onClick={() => handleModerateComment(c.id, "delete")}
                          className="text-ivory/60 hover:text-red-400 cursor-pointer"
                          title="Remove comment"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] leading-relaxed break-words">{c.comment}</p>
                  </div>
                ))
              )}
              <div ref={commentsEndRef} />
            </div>

            {/* Host reply composer */}
            <form onSubmit={handleSendComment} className="pt-2 mt-2 border-t border-gold/20 flex gap-1.5">
              <input
                type="text"
                placeholder={commentsEnabled ? "Respond to seekers..." : "Comments disabled"}
                disabled={!commentsEnabled || isSendingComment}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="flex-1 bg-white/10 border border-gold/30 rounded-lg px-2.5 py-1.5 text-xs text-ivory outline-none placeholder:text-ivory/40"
              />
              <button
                type="submit"
                disabled={!commentsEnabled || !newComment.trim() || isSendingComment}
                className="bg-gold px-3 py-1.5 rounded-lg text-midnight font-bold text-xs hover:bg-gold-light disabled:opacity-50 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs pt-4 border-t border-gold/20 flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-champagne">{broadcast.title}</h2>
            <p className="text-ivory/70">{broadcast.description || "Live astrological discourse"}</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-gold/15 border border-gold/30 px-3.5 py-1 text-gold font-semibold">
            <Users className="h-4 w-4" />{" "}
            {viewerCount !== null ? `${viewerCount} Live Viewers` : "Connecting to room..."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={CARD}>
      {/* Tab Navigation */}
      <div className="flex items-center gap-4 border-b border-gold/20 pb-4 mb-6">
        <button
          onClick={() => setActiveTab("golive")}
          className={`flex items-center gap-2 text-xs font-bold pb-1 border-b-2 cursor-pointer transition ${
            activeTab === "golive"
              ? "border-gold text-midnight"
              : "border-transparent text-muted hover:text-midnight"
          }`}
        >
          <Radio className="h-4 w-4 text-gold-deep" /> Go Live Studio
        </button>
        <button
          onClick={() => setActiveTab("schedule")}
          className={`flex items-center gap-2 text-xs font-bold pb-1 border-b-2 cursor-pointer transition ${
            activeTab === "schedule"
              ? "border-gold text-midnight"
              : "border-transparent text-muted hover:text-midnight"
          }`}
        >
          <Calendar className="h-4 w-4 text-gold-deep" /> Schedule Broadcast
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex items-center gap-2 text-xs font-bold pb-1 border-b-2 cursor-pointer transition ${
            activeTab === "history"
              ? "border-gold text-midnight"
              : "border-transparent text-muted hover:text-midnight"
          }`}
        >
          <History className="h-4 w-4 text-gold-deep" /> Broadcast History
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* TAB 1: GO LIVE STUDIO */}
      {activeTab === "golive" && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/20 text-gold-deep border border-gold/30">
              <Radio className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-midnight">Start a Live Astrological Broadcast</h2>
              <p className="text-xs text-muted">
                Host live interactive discourse, analyze planetary shifts, and answer seeker questions via WebRTC.
              </p>
            </div>
          </div>

          <form onSubmit={handleStartLive} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                Broadcast Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Live Shani Sade Sati Remedies & Chart Analysis"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-gold/30 text-xs outline-none focus:border-gold"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Topic</label>
                <select
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-gold/30 text-xs outline-none focus:border-gold bg-white"
                >
                  <option value="Vedic Astrology">Vedic Astrology & Predictions</option>
                  <option value="Daily Transits">Planetary Transits (Gochar)</option>
                  <option value="Kundli Remedies">Dasha & Kundli Remedies</option>
                  <option value="Career & Finances">Career & Financial Astrology</option>
                  <option value="Spiritual Discourses">Spiritual Wisdom & Mantras</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Host Identity</label>
                <input
                  type="text"
                  disabled
                  value={`${astrologerName} (Verified Host)`}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">Description (Optional)</label>
              <textarea
                rows={3}
                placeholder="Provide context on topics covered or special mantras for seekers..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-gold/30 text-xs outline-none focus:border-gold"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={loading || !title.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-6 py-2.5 text-xs font-bold text-midnight shadow hover:opacity-95 disabled:opacity-50 cursor-pointer"
              >
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                {loading ? "Establishing Stream..." : "Go Live Now"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: SCHEDULE BROADCAST */}
      {activeTab === "schedule" && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/20 text-gold-deep border border-gold/30">
              <Calendar className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-midnight">Schedule Upcoming Live Session</h2>
              <p className="text-xs text-muted">
                Plan future discourses. Registered followers will automatically receive reminder notifications.
              </p>
            </div>
          </div>

          {scheduleMsg && (
            <div
              className={`mb-4 p-3 rounded-xl border text-xs ${
                scheduleMsg.type === "success"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-red-50 border-red-200 text-red-800"
              }`}
            >
              {scheduleMsg.text}
            </div>
          )}

          <form onSubmit={handleScheduleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">Session Title *</label>
              <input
                type="text"
                required
                placeholder="e.g., Weekly Rahu-Ketu Transit Effects on All Rashis"
                value={scheduleTitle}
                onChange={(e) => setScheduleTitle(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-gold/30 text-xs outline-none focus:border-gold"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Date *</label>
                <input
                  type="date"
                  required
                  min={new Date().toISOString().split("T")[0]}
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-gold/30 text-xs outline-none focus:border-gold bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Time *</label>
                <input
                  type="time"
                  required
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-gold/30 text-xs outline-none focus:border-gold bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">Duration</label>
                <select
                  value={scheduleDuration}
                  onChange={(e) => setScheduleDuration(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-gold/30 text-xs outline-none focus:border-gold bg-white"
                >
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes</option>
                  <option value="90">90 minutes</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-6 py-2.5 text-xs font-bold text-midnight shadow hover:opacity-95 cursor-pointer"
              >
                <Calendar className="h-4 w-4" /> Schedule Broadcast
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: BROADCAST HISTORY */}
      {activeTab === "history" && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/20 text-gold-deep border border-gold/30">
              <History className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-midnight">Past Broadcast History</h2>
              <p className="text-xs text-muted">
                Review completed discourses, duration, and peak viewer attendance metrics.
              </p>
            </div>
          </div>

          {loadingHistory ? (
            <div className="py-8 text-center text-xs text-muted">Loading broadcast archives...</div>
          ) : historyList.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted">No past broadcasts recorded yet.</div>
          ) : (
            <div className="divide-y divide-slate-100 border rounded-xl overflow-hidden">
              {historyList.map((item) => (
                <div key={item.id} className="p-4 flex items-center justify-between text-xs flex-wrap gap-2">
                  <div>
                    <h4 className="font-bold text-midnight">{item.title}</h4>
                    <p className="text-[11px] text-muted">
                      {new Date(item.created_at).toLocaleDateString()} • Topic: {item.topic}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <span className="font-semibold text-midnight">{item.peak_viewer_count || 0}</span>
                      <span className="text-[11px] text-muted block">Peak Viewers</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        item.status === "ended"
                          ? "bg-slate-100 text-slate-700"
                          : item.status === "live"
                          ? "bg-red-50 text-red-600 animate-pulse"
                          : "bg-sky-50 text-sky-700"
                      }`}
                    >
                      {item.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
