"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Radio,
  Users,
  Sparkles,
  Video,
  Play,
  AlertCircle,
  RefreshCw,
  MessageSquare,
  Send,
  Pin,
  Volume2,
  VolumeX,
  Maximize,
  Calendar,
  Clock,
  Bell,
  Check,
  Flag,
} from "lucide-react";
import { Room, RoomEvent, RemoteTrackPublication, RemoteParticipant, Track } from "livekit-client";
import {
  getBroadcastViewerToken,
  getAuthoritativeBroadcastViewerCount,
  getActiveLiveBroadcasts,
  sendBroadcastComment,
  getBroadcastComments,
  reportBroadcastAbuse,
  type BroadcastTokenResult,
  type BroadcastComment,
} from "@/app/actions/broadcast";
import { toggleFollowAstrologer } from "@/app/actions/follows";
import { useRouter } from "next/navigation";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] p-5 transition hover:shadow-lg";

export function CustomerBroadcastListClient({
  initialBroadcasts,
  upcomingBroadcasts = [],
  followedAstrologerIds = [],
}: {
  initialBroadcasts: any[];
  upcomingBroadcasts?: any[];
  followedAstrologerIds?: string[];
}) {
  const router = useRouter();
  const [liveList, setLiveList] = useState<any[]>(initialBroadcasts);
  const [activeTab, setActiveTab] = useState<"live" | "upcoming">("live");
  const [activeBroadcast, setActiveBroadcast] = useState<any | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState<number | null>(null);

  // Audio / Player Controls
  const [isMuted, setIsMuted] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // Comments state
  const [comments, setComments] = useState<BroadcastComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSendingComment, setIsSendingComment] = useState(false);

  // Reminder / Follow states
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set(followedAstrologerIds));
  const [remindersSet, setRemindersSet] = useState<Set<string>>(new Set());

  // Report Modal
  const [reportingBroadcastId, setReportingBroadcastId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportSuccess, setReportSuccess] = useState(false);

  const videoContainerRef = useRef<HTMLDivElement>(null);
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Teardown subscriber room connection
  const disconnectStream = useCallback(async () => {
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
    }
    if (videoContainerRef.current) videoContainerRef.current.innerHTML = "";
    if (audioContainerRef.current) audioContainerRef.current.innerHTML = "";
    setActiveBroadcast(null);
    setConnecting(false);
    setViewerError(null);
    setViewerCount(null);
    setComments([]);
    setAudioElement(null);
  }, []);

  useEffect(() => {
    return () => {
      void disconnectStream();
    };
  }, [disconnectStream]);

  // Sync initialBroadcasts prop changes
  useEffect(() => {
    setLiveList(initialBroadcasts);
  }, [initialBroadcasts]);

  // Periodic Poller to sync active broadcasts and end session immediately if astrologer ended broadcast
  useEffect(() => {
    const pollBroadcasts = async () => {
      const liveRes = await getActiveLiveBroadcasts();
      if (liveRes.success && liveRes.data) {
        setLiveList(liveRes.data);

        // If currently viewing a broadcast that is no longer in liveList, terminate customer viewing session
        if (activeBroadcast) {
          const stillActive = liveRes.data.some((b: any) => b.id === activeBroadcast.id);
          if (!stillActive) {
            setViewerError("This live broadcast has ended. The astrologer concluded the session.");
            if (roomRef.current) {
              await roomRef.current.disconnect(true).catch(() => {});
              roomRef.current = null;
            }
            if (videoContainerRef.current) videoContainerRef.current.innerHTML = "";
            if (audioContainerRef.current) audioContainerRef.current.innerHTML = "";
            setActiveBroadcast(null);
            setViewerCount(null);
          }
        }
      }
    };

    const interval = setInterval(pollBroadcasts, 4000);
    return () => clearInterval(interval);
  }, [activeBroadcast]);

  // Periodic Viewer Count & Stream Active Poller
  useEffect(() => {
    if (!activeBroadcast) return;
    const interval = setInterval(async () => {
      const res = await getAuthoritativeBroadcastViewerCount(activeBroadcast.room_name);
      if (res.success) {
        // If broadcast status is ended or not live in database
        if (res.isLive === false) {
          setViewerError("This live broadcast has ended. The astrologer concluded the session.");
          await disconnectStream();
          return;
        }

        if (res.viewerCount !== null) {
          setViewerCount(res.viewerCount);
          if (!res.isHostOnline) {
            setViewerError("Astrologer has temporarily paused transmission. Reconnecting...");
          } else if (viewerError?.includes("paused")) {
            setViewerError(null);
          }
        }
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [activeBroadcast, viewerError, disconnectStream]);

  // Comments Poller
  useEffect(() => {
    if (!activeBroadcast) return;
    const fetchComments = async () => {
      const res = await getBroadcastComments(activeBroadcast.id);
      if (res.success) {
        setComments(res.comments);
      }
    };
    void fetchComments();
    const interval = setInterval(fetchComments, 3500);
    return () => clearInterval(interval);
  }, [activeBroadcast]);

  const handleJoinStream = async (broadcast: any) => {
    await disconnectStream();
    setActiveBroadcast(broadcast);
    setConnecting(true);
    setViewerError(null);

    try {
      // 1. Obtain authenticated viewer token
      const res = await getBroadcastViewerToken(broadcast.id);
      if (!res.success || !res.tokenResult) {
        throw new Error(res.error || "Failed to obtain stream access token.");
      }

      const tokenResult: BroadcastTokenResult = res.tokenResult;

      // 2. Initialize LiveKit Room in Subscribe-Only mode
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      room.on(
        RoomEvent.TrackSubscribed,
        (track: Track, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
          if (track.kind === Track.Kind.Video && videoContainerRef.current) {
            videoContainerRef.current.innerHTML = "";
            const el = track.attach();
            el.className = "w-full h-full object-cover rounded-xl";
            videoContainerRef.current.appendChild(el);
          } else if (track.kind === Track.Kind.Audio && audioContainerRef.current) {
            const el = track.attach() as HTMLAudioElement;
            setAudioElement(el);
            audioContainerRef.current.appendChild(el);
          }
        }
      );

      room.on(RoomEvent.TrackUnsubscribed, (track: Track) => {
        track.detach();
      });

      room.on(RoomEvent.Disconnected, () => {
        setViewerError("The astrologer has concluded this broadcast session.");
        setConnecting(false);
      });

      await room.connect(tokenResult.serverUrl, tokenResult.token);
      setConnecting(false);

      // Check existing remote tracks if host is already transmitting
      room.remoteParticipants.forEach((p) => {
        p.trackPublications.forEach((pub) => {
          if (pub.isSubscribed && pub.track) {
            if (pub.track.kind === Track.Kind.Video && videoContainerRef.current) {
              videoContainerRef.current.innerHTML = "";
              const el = pub.track.attach();
              el.className = "w-full h-full object-cover rounded-xl";
              videoContainerRef.current.appendChild(el);
            } else if (pub.track.kind === Track.Kind.Audio && audioContainerRef.current) {
              const el = pub.track.attach() as HTMLAudioElement;
              setAudioElement(el);
              audioContainerRef.current.appendChild(el);
            }
          }
        });
      });
    } catch (err: any) {
      console.error("[CustomerBroadcast] Viewer connection failed:", err);
      setViewerError(err.message || "Could not connect to live stream.");
      setConnecting(false);
    }
  };

  const toggleMute = () => {
    if (audioElement) {
      audioElement.muted = !audioElement.muted;
      setIsMuted(audioElement.muted);
    }
  };

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !activeBroadcast || isSendingComment) return;

    setIsSendingComment(true);
    try {
      const res = await sendBroadcastComment({
        broadcastId: activeBroadcast.id,
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

  const handleToggleFollow = async (astrologerId: string) => {
    const res = await toggleFollowAstrologer(astrologerId);
    if (res.success) {
      setFollowedIds((prev) => {
        const next = new Set(prev);
        if (res.isFollowing) next.add(astrologerId);
        else next.delete(astrologerId);
        return next;
      });
    }
  };

  const toggleReminder = (broadcastId: string) => {
    setRemindersSet((prev) => {
      const next = new Set(prev);
      if (next.has(broadcastId)) next.delete(broadcastId);
      else next.add(broadcastId);
      return next;
    });
  };

  const handleReportAbuse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportingBroadcastId || !reportReason.trim()) return;

    const res = await reportBroadcastAbuse({
      broadcastId: reportingBroadcastId,
      reason: reportReason.trim(),
    });

    if (res.success) {
      setReportSuccess(true);
      setTimeout(() => {
        setReportingBroadcastId(null);
        setReportReason("");
        setReportSuccess(false);
      }, 1500);
    }
  };

  const pinnedComment = comments.find((c) => c.is_pinned);

  return (
    <div className="space-y-6">
      {/* Hidden audio container for remote audio playback */}
      <div ref={audioContainerRef} className="hidden" />

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-gold/20 pb-3">
        <button
          onClick={() => setActiveTab("live")}
          className={`flex items-center gap-2 text-xs font-bold pb-1 border-b-2 cursor-pointer transition ${
            activeTab === "live"
              ? "border-gold text-midnight"
              : "border-transparent text-muted hover:text-midnight"
          }`}
        >
          <Radio className="h-4 w-4 text-red-500 animate-pulse" /> Live Now ({liveList.length})
        </button>
        <button
          onClick={() => setActiveTab("upcoming")}
          className={`flex items-center gap-2 text-xs font-bold pb-1 border-b-2 cursor-pointer transition ${
            activeTab === "upcoming"
              ? "border-gold text-midnight"
              : "border-transparent text-muted hover:text-midnight"
          }`}
        >
          <Calendar className="h-4 w-4 text-gold-deep" /> Upcoming Scheduled Sessions ({upcomingBroadcasts.length})
        </button>
      </div>

      {/* ACTIVE LIVE STREAM VIEWER WITH REALTIME COMMENTS */}
      {activeBroadcast && (
        <div className="relative overflow-hidden rounded-2xl border-2 border-gold bg-midnight p-6 text-ivory shadow-2xl animate-in fade-in duration-300">
          <div className="flex items-center justify-between pb-4 border-b border-gold/20 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              <span className="text-xs font-black tracking-widest text-red-400 uppercase">
                WATCHING LIVE STREAM
              </span>
              <span className="text-xs text-ivory/60">• {activeBroadcast.topic}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMute}
                className="p-1.5 rounded-lg border border-gold/30 hover:bg-white/10 text-xs font-semibold cursor-pointer"
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4 text-emerald-400" />}
              </button>
              <button
                type="button"
                onClick={() => setReportingBroadcastId(activeBroadcast.id)}
                className="p-1.5 rounded-lg border border-gold/30 hover:bg-white/10 text-xs font-semibold text-ivory/70 hover:text-red-400 cursor-pointer"
                title="Report broadcast"
              >
                <Flag className="h-4 w-4" />
              </button>
              <button
                onClick={() => void disconnectStream()}
                className="text-xs text-ivory/60 hover:text-ivory px-3 py-1.5 rounded-lg border border-gold/30 hover:bg-white/10 font-bold cursor-pointer"
              >
                Exit Stream
              </button>
            </div>
          </div>

          {/* Media Player + Live Q&A Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 my-6">
            <div className="lg:col-span-2 aspect-video rounded-xl bg-black border border-gold/30 relative overflow-hidden flex items-center justify-center">
              <div ref={videoContainerRef} className="w-full h-full" />

              {(connecting || viewerError) && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-6 text-center">
                  {connecting ? (
                    <>
                      <RefreshCw className="h-10 w-10 text-gold animate-spin mb-3" />
                      <p className="text-sm font-semibold text-champagne">Connecting to Live WebRTC Stream...</p>
                      <p className="text-xs text-ivory/60 mt-1">Establishing high-fidelity audio/video session.</p>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
                      <p className="text-sm font-semibold text-champagne">{viewerError}</p>
                      {viewerError?.includes("ended") || viewerError?.includes("concluded") ? (
                        <div className="flex items-center gap-2 mt-4">
                          <button
                            onClick={() => void disconnectStream()}
                            className="rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-4 py-2 text-xs font-bold text-midnight shadow hover:opacity-95 cursor-pointer"
                          >
                            Return to Live Broadcasts
                          </button>
                          {activeBroadcast?.astrologer_id && (
                            <Link
                              href={`/customer/astrologers/${activeBroadcast.astrologer_id}`}
                              className="rounded-xl border border-gold/40 bg-gold/15 px-4 py-2 text-xs font-semibold text-champagne hover:bg-gold/25"
                            >
                              View Astrologer Profile
                            </Link>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => void handleJoinStream(activeBroadcast)}
                          className="mt-3 rounded-xl bg-gold/20 border border-gold/40 px-3 py-1.5 text-xs text-champagne hover:bg-gold/30 cursor-pointer"
                        >
                          Retry Connection
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Live Seeker Comments Panel */}
            <div className="flex flex-col h-[320px] lg:h-auto rounded-xl border border-gold/25 bg-black/40 backdrop-blur-md p-4">
              <div className="flex items-center justify-between pb-2 border-b border-gold/20 mb-3">
                <span className="flex items-center gap-1.5 text-xs font-bold text-gold">
                  <MessageSquare className="h-4 w-4" /> Live Seeker Discussion
                </span>
                <span className="text-[10px] text-ivory/60">{comments.length} comments</span>
              </div>

              {pinnedComment && (
                <div className="mb-2 p-2 rounded-lg bg-gold/20 border border-gold/40 text-xs text-champagne flex items-center gap-1.5">
                  <Pin className="h-3 w-3 text-gold shrink-0 rotate-45" />
                  <span className="font-bold text-[11px]">{pinnedComment.sender_name}:</span>
                  <span className="truncate text-[11px]">{pinnedComment.comment}</span>
                </div>
              )}

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
                {comments.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-ivory/40 text-[11px] text-center">
                    Ask a question about your chart or planetary placements.
                  </div>
                ) : (
                  comments.map((c) => (
                    <div
                      key={c.id}
                      className={`p-2 rounded-lg border text-left transition ${
                        c.sender_role === "astrologer"
                          ? "bg-gold/20 border-gold text-gold-deep"
                          : "bg-white/5 border-white/10 text-ivory"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] text-ivory/60 mb-1">
                        <span className="font-bold text-champagne">{c.sender_name}</span>
                        <span>{new Date(c.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <p className="text-[11px] leading-relaxed break-words">{c.comment}</p>
                    </div>
                  ))
                )}
                <div ref={commentsEndRef} />
              </div>

              {/* Comment Composer */}
              <form onSubmit={handleSendComment} className="pt-2 mt-2 border-t border-gold/20 flex gap-1.5">
                <input
                  type="text"
                  placeholder="Post question to astrologer..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  disabled={isSendingComment}
                  className="flex-1 bg-white/10 border border-gold/30 rounded-lg px-2.5 py-1.5 text-xs text-ivory outline-none placeholder:text-ivory/40"
                />
                <button
                  type="submit"
                  disabled={!newComment.trim() || isSendingComment}
                  className="bg-gold px-3 py-1.5 rounded-lg text-midnight font-bold text-xs hover:bg-gold-light disabled:opacity-50 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gold/20 text-xs flex-wrap gap-2">
            <div>
              <p className="font-semibold text-champagne">
                Host: {activeBroadcast.astrologer?.display_name || "Verified Astrologer"}
              </p>
              <p className="text-ivory/60">{activeBroadcast.title}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 border border-gold/30 px-3 py-1 text-gold">
                <Users className="h-3.5 w-3.5" />{" "}
                {viewerCount !== null ? `${viewerCount} Live Viewers` : "Live"}
              </span>
              <button
                type="button"
                onClick={() => handleToggleFollow(activeBroadcast.astrologer_id)}
                className={`rounded-xl border px-3 py-1.5 font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition ${
                  followedIds.has(activeBroadcast.astrologer_id)
                    ? "border-gold bg-gold text-midnight"
                    : "border-gold/40 bg-gold/15 text-champagne hover:bg-gold/25"
                }`}
              >
                <Bell className="h-3.5 w-3.5" />
                {followedIds.has(activeBroadcast.astrologer_id) ? "Following" : "Follow"}
              </button>
              <Link
                href={`/customer/astrologers/${activeBroadcast.astrologer_id}`}
                className="rounded-xl border border-gold/40 bg-gold/15 px-3 py-1.5 font-semibold text-champagne hover:bg-gold/25"
              >
                View Profile
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: LIVE BROADCASTS GRID */}
      {activeTab === "live" && (
        <div>
          {liveList.length === 0 ? (
            <div className={`${CARD} py-16 px-6 text-center`}>
              <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 mb-4 border border-amber-200">
                <Radio className="h-8 w-8" />
              </span>
              <h2 className="text-lg font-semibold text-midnight">No Astrologers Live Right Now</h2>
              <p className="text-xs text-muted max-w-md mx-auto mt-1 mb-6">
                Verified astrologers regularly host live interactive discussions on daily transits, remedies, and astrological Q&A. View scheduled upcoming sessions or consult an astrologer directly.
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setActiveTab("upcoming")}
                  className="inline-flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/10 px-5 py-2.5 text-xs font-bold text-midnight shadow-xs hover:bg-gold/20 cursor-pointer"
                >
                  <Calendar className="h-4 w-4 text-gold-deep" /> View Upcoming Sessions
                </button>
                <Link
                  href="/customer/astrologers"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-5 py-2.5 text-xs font-bold text-midnight shadow hover:opacity-95"
                >
                  <Sparkles className="h-4 w-4" /> Browse Verified Astrologers
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {liveList.map((b) => (
                <div key={b.id} className={CARD}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[10px] font-black text-red-600 uppercase">
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" /> LIVE
                    </span>
                    <span className="text-[11px] font-medium text-muted">{b.topic}</span>
                  </div>

                  <h3 className="mt-3 font-bold text-midnight text-sm line-clamp-1">{b.title}</h3>
                  <p className="text-xs text-muted mt-1 line-clamp-2">
                    {b.description || "Interactive Vedic astrology discussion and planetary analysis."}
                  </p>

                  <div className="mt-4 pt-3 border-t border-gold/15 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="relative h-7 w-7 rounded-full overflow-hidden border border-gold/40 bg-parchment shrink-0">
                        {b.astrologer?.profile_photo_url ? (
                          <Image
                            src={b.astrologer.profile_photo_url}
                            alt={b.astrologer.display_name}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center font-bold text-gold-deep text-xs">
                            {b.astrologer?.display_name?.charAt(0) || "A"}
                          </div>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-midnight truncate max-w-[100px]">
                        {b.astrologer?.display_name}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleJoinStream(b)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-3.5 py-1.5 text-xs font-bold text-midnight shadow hover:opacity-95 cursor-pointer"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" /> Watch Stream
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: UPCOMING SCHEDULED SESSIONS */}
      {activeTab === "upcoming" && (
        <div>
          {upcomingBroadcasts.length === 0 ? (
            <div className={`${CARD} py-12 text-center text-xs text-muted`}>
              No upcoming sessions scheduled right now. Check back soon!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcomingBroadcasts.map((b) => (
                <div key={b.id} className={CARD}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 border border-sky-200 px-2.5 py-0.5 text-[10px] font-bold text-sky-700">
                      <Calendar className="h-3 w-3" /> SCHEDULED
                    </span>
                    <span className="text-[11px] font-medium text-muted">{b.topic}</span>
                  </div>

                  <h3 className="mt-3 font-bold text-midnight text-sm line-clamp-1">{b.title}</h3>
                  <p className="text-xs text-muted mt-1 line-clamp-2">
                    {b.description || "Upcoming astrological discourse and Q&A."}
                  </p>

                  <div className="my-3 p-2 rounded-xl bg-parchment/60 border border-gold/20 flex items-center gap-2 text-xs text-midnight">
                    <Clock className="h-3.5 w-3.5 text-gold-deep" />
                    <span>
                      {b.scheduled_for ? new Date(b.scheduled_for).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Coming Soon"}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-gold/15 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="relative h-7 w-7 rounded-full overflow-hidden border border-gold/40 bg-parchment shrink-0">
                        {b.astrologer?.profile_photo_url ? (
                          <Image
                            src={b.astrologer.profile_photo_url}
                            alt={b.astrologer.display_name}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center font-bold text-gold-deep text-xs">
                            {b.astrologer?.display_name?.charAt(0) || "A"}
                          </div>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-midnight truncate max-w-[100px]">
                        {b.astrologer?.display_name}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleReminder(b.id)}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                        remindersSet.has(b.id)
                          ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                          : "border border-gold/30 bg-gold/10 text-midnight hover:bg-gold/20"
                      }`}
                    >
                      {remindersSet.has(b.id) ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Reminder Set
                        </>
                      ) : (
                        <>
                          <Bell className="h-3.5 w-3.5" /> Set Reminder
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* REPORT ABUSE MODAL */}
      {reportingBroadcastId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 border border-gold/30 shadow-2xl">
            <h3 className="font-bold text-base text-midnight mb-2">Report Live Broadcast</h3>
            <p className="text-xs text-muted mb-4">
              Super Admins will review the session log and audio/video activity.
            </p>

            {reportSuccess ? (
              <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-xl font-semibold text-center">
                Report submitted successfully. Thank you for keeping Karmic Ascension safe.
              </div>
            ) : (
              <form onSubmit={handleReportAbuse} className="space-y-4">
                <textarea
                  required
                  rows={3}
                  placeholder="Describe reason for reporting (inappropriate content, harassment, etc.)..."
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 outline-none focus:border-gold"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setReportingBroadcastId(null)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700"
                  >
                    Submit Report
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
