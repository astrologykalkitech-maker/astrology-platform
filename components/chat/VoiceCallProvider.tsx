"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  LoaderCircle,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Room, RoomEvent, Track } from "livekit-client";
import {
  acceptVoiceCallAction,
  getActiveVoiceCallAction,
  getVoiceCallTokenAction,
  heartbeatVoiceCallAction,
  startVoiceCallAction,
  updateVoiceCallStatusAction,
} from "@/app/actions/voice-calls";
import { createClient } from "@/lib/supabase/client";
import type { VoiceCall } from "@/lib/types/database.types";
import type { AccountPresenceRole } from "@/lib/chat/presence";
import { getVoiceCallDurationSeconds } from "@/lib/chat/voice-call";

type VoiceCallContextValue = {
  activeCall: VoiceCall | null;
  startCall: (conversationId: string) => Promise<{ success: boolean; error?: string }>;
  canStartCall: boolean;
};

const VoiceCallContext = createContext<VoiceCallContextValue | null>(null);
const LIVE_STATUSES = new Set(["ringing", "accepted", "active"]);
const TERMINAL_STATUS_LABELS: Record<string, string> = {
  declined: "The call was declined.",
  cancelled: "The call was cancelled.",
  missed: "The call was not answered.",
  ended: "The call ended.",
  failed: "The call could not be connected.",
};

export function useVoiceCall() {
  const context = useContext(VoiceCallContext);
  if (!context) throw new Error("useVoiceCall must be used inside VoiceCallProvider.");
  return context;
}

function getCallParticipantName(call: VoiceCall, userId: string) {
  return call.caller_id === userId ? call.callee_name : call.caller_name;
}

function formatCallDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function VoiceCallRoom({
  call,
  userId,
  onEnd,
}: {
  call: VoiceCall;
  userId: string;
  onEnd: (reason?: string) => void;
}) {
  const [connecting, setConnecting] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isPeerConnected, setIsPeerConnected] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const remoteAudioRef = useRef<HTMLDivElement>(null);
  const localEndRef = useRef(false);
  const speakerOnRef = useRef(isSpeakerOn);

  useEffect(() => {
    speakerOnRef.current = isSpeakerOn;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.querySelectorAll("audio").forEach((audio) => {
        audio.volume = isSpeakerOn ? 1 : 0;
      });
    }
  }, [isSpeakerOn]);

  useEffect(() => {
    let mounted = true;
    const room = new Room({ adaptiveStream: false, dynacast: false });
    roomRef.current = room;

    const updatePeerStatus = () => {
      if (mounted) setIsPeerConnected(room.remoteParticipants.size > 0);
    };

    room.on(RoomEvent.ParticipantConnected, updatePeerStatus);
    room.on(RoomEvent.ParticipantDisconnected, updatePeerStatus);
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind !== Track.Kind.Audio || !remoteAudioRef.current) return;
      const element = track.attach();
      element.autoplay = true;
      element.volume = speakerOnRef.current ? 1 : 0;
      remoteAudioRef.current.appendChild(element);
      void element.play().catch((playError: unknown) => {
        console.warn("[Voice call] Browser blocked audio playback:", playError);
        setError("Allow audio playback in your browser to hear the call.");
      });
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((element) => element.remove());
    });
    room.on(RoomEvent.Disconnected, () => {
      if (!mounted || localEndRef.current) return;
      onEnd("The call connection was lost.");
    });

    void (async () => {
      try {
        const tokenResult = await getVoiceCallTokenAction(call.id);
        if (!tokenResult.success || !tokenResult.token || !tokenResult.serverUrl) {
          throw new Error(tokenResult.error || "Unable to connect the call.");
        }

        await room.connect(tokenResult.serverUrl, tokenResult.token);
        if (!mounted) {
          await room.disconnect();
          return;
        }

        await room.localParticipant.setMicrophoneEnabled(true);
        const statusResult = await updateVoiceCallStatusAction(call.id, "active");
        if (!statusResult.success) {
          throw new Error(statusResult.error || "Unable to join the call.");
        }

        updatePeerStatus();
        setConnecting(false);
      } catch (connectionError) {
        if (!mounted) return;
        const message =
          connectionError instanceof Error
            ? connectionError.message
            : "Unable to connect the call.";
        setError(message);
        setConnecting(false);
        await updateVoiceCallStatusAction(call.id, "failed", message);
      }
    })();

    return () => {
      mounted = false;
      localEndRef.current = true;
      room.removeAllListeners();
      void room.disconnect();
      roomRef.current = null;
    };
  }, [call.id, onEnd]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDuration(getVoiceCallDurationSeconds(call));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [call]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void heartbeatVoiceCallAction(call.id).then((result) => {
        if (!result.success && !localEndRef.current) {
          localEndRef.current = true;
          onEnd(result.error || "The call is no longer active.");
        }
      });
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [call.id, onEnd]);

  const toggleMute = async () => {
    const nextMuted = !isMuted;
    try {
      await roomRef.current?.localParticipant.setMicrophoneEnabled(!nextMuted);
      setIsMuted(nextMuted);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unable to change microphone.");
    }
  };

  const handleEnd = () => {
    localEndRef.current = true;
    onEnd();
  };

  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gold/15 text-midnight">
        <Phone className="h-8 w-8" aria-hidden="true" />
      </div>
      <div>
        <h2 className="font-display text-xl font-bold text-midnight">
          {getCallParticipantName(call, userId)}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {connecting
            ? "Connecting audio…"
            : error
              ? "Call connection failed"
              : isPeerConnected
                ? formatCallDuration(duration)
                : "Waiting for the other participant…"}
        </p>
        {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
      </div>

      <div ref={remoteAudioRef} className="hidden" aria-hidden="true" />

      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => void toggleMute()}
          disabled={connecting || Boolean(error)}
          aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-gold/30 bg-white text-midnight disabled:opacity-50"
        >
          {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={() => setIsSpeakerOn((value) => !value)}
          aria-label={isSpeakerOn ? "Mute speaker" : "Unmute speaker"}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-gold/30 bg-white text-midnight"
        >
          {isSpeakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={handleEnd}
          aria-label="End call"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-600 text-white hover:bg-rose-700"
        >
          <PhoneOff className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export function VoiceCallProvider({
  role,
  userId,
  children,
}: {
  role: AccountPresenceRole;
  userId: string;
  children: ReactNode;
}) {
  const [activeCall, setActiveCall] = useState<VoiceCall | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const activeCallRef = useRef<VoiceCall | null>(null);

  const applyCall = useCallback((call: VoiceCall | null | undefined) => {
    if (!call) {
      activeCallRef.current = null;
      setActiveCall(null);
      return;
    }
    activeCallRef.current = call;
    setActiveCall((current) => {
      if (
        current?.id === call.id &&
        current.status === call.status &&
        current.updated_at === call.updated_at
      ) {
        return current;
      }
      return call;
    });
    if (!LIVE_STATUSES.has(call.status)) {
      window.setTimeout(() => {
        setActiveCall((current) => (current?.id === call.id ? null : current));
      }, 5000);
    }
  }, []);

  const refreshCall = useCallback(async () => {
    const result = await getActiveVoiceCallAction();
    if (result.success) applyCall(result.call);
  }, [applyCall]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`voice-calls:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "voice_calls" },
        (payload) => {
          const call = (payload.new || payload.old) as VoiceCall | undefined;
          if (
            !call ||
            (call.caller_id !== userId && call.callee_id !== userId) ||
            (call.caller_id === userId && call.caller_role !== role) ||
            (call.callee_id === userId && call.callee_role !== role)
          ) return;
          applyCall(call);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refreshCall();
      });

    const poll = window.setInterval(() => void refreshCall(), 5000);
    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [applyCall, refreshCall, role, userId]);

  useEffect(() => {
    if (!activeCall || activeCall.status !== "ringing") return;
    const remaining = Math.max(
      0,
      45_000 - (Date.now() - new Date(activeCall.created_at).getTime())
    );
    const timeout = window.setTimeout(() => void refreshCall(), remaining + 100);
    return () => window.clearTimeout(timeout);
  }, [activeCall, refreshCall]);

  const startCall = useCallback(async (conversationId: string) => {
    setActionError(null);
    if (activeCall && LIVE_STATUSES.has(activeCall.status)) {
      return { success: false, error: "Finish your current call before starting another." };
    }
    setIsWorking(true);
    try {
      const result = await startVoiceCallAction(conversationId);
      if (result.success && result.call) applyCall(result.call);
      return { success: result.success, error: result.error };
    } catch (error) {
      console.error("[Voice call] Could not start call:", error);
      return { success: false, error: "Unable to start the call. Please try again." };
    } finally {
      setIsWorking(false);
    }
  }, [activeCall, applyCall]);

  const answerCall = async () => {
    if (!activeCall) return;
    setActionError(null);
    setIsWorking(true);
    try {
      const result = await acceptVoiceCallAction(activeCall.id);
      if (result.success && result.call) applyCall(result.call);
      else setActionError(result.error || "Unable to answer the call.");
    } catch (error) {
      console.error("[Voice call] Could not answer call:", error);
      setActionError("Unable to answer the call. Please try again.");
    } finally {
      setIsWorking(false);
    }
  };

  const finishCall = useCallback(async (reason?: string) => {
    const activeCall = activeCallRef.current;
    if (!activeCall) return;
    const status =
      activeCall.status === "ringing"
        ? activeCall.caller_id === userId
          ? "cancelled"
          : "declined"
        : "ended";
    try {
      const result = await updateVoiceCallStatusAction(activeCall.id, status, reason);
      if (result.success) applyCall(result.call || { ...activeCall, status });
      else setActionError(result.error || "Unable to end the call.");
    } catch (error) {
      console.error("[Voice call] Could not end call:", error);
      setActionError("Unable to end the call. Please try again.");
    }
  }, [applyCall, userId]);
  const handleRoomEnd = useCallback(
    (reason?: string) => void finishCall(reason),
    [finishCall]
  );

  const isIncoming =
    activeCall?.status === "ringing" && activeCall.callee_id === userId;
  const isOutgoing =
    activeCall?.status === "ringing" && activeCall.caller_id === userId;
  const isConnectedCall =
    activeCall && (activeCall.status === "accepted" || activeCall.status === "active");

  return (
    <VoiceCallContext.Provider
      value={{ activeCall, startCall, canStartCall: !isWorking && !activeCall }}
    >
      {children}
      {activeCall && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-midnight/60 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="voice-call-title"
            className="w-full max-w-sm rounded-3xl border border-gold/30 bg-white p-6 shadow-2xl"
          >
            {isIncoming ? (
              <div className="space-y-5 text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Phone className="h-8 w-8" aria-hidden="true" />
                </div>
                <div>
                  <h2 id="voice-call-title" className="font-display text-xl font-bold text-midnight">
                    Incoming voice call
                  </h2>
                  <p className="mt-1 text-sm text-muted">{activeCall.caller_name}</p>
                  {actionError && <p className="mt-2 text-sm text-rose-700">{actionError}</p>}
                </div>
                <div className="flex justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => void finishCall()}
                    disabled={isWorking}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-600 text-white disabled:opacity-50"
                    aria-label="Decline call"
                  >
                    <PhoneOff className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void answerCall()}
                    disabled={isWorking}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white disabled:opacity-50"
                    aria-label="Answer call"
                  >
                    {isWorking ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Phone className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            ) : isOutgoing ? (
              <div className="space-y-5 text-center">
                <div className="mx-auto flex h-20 w-20 animate-pulse items-center justify-center rounded-full bg-gold/15 text-midnight">
                  <Phone className="h-8 w-8" aria-hidden="true" />
                </div>
                <div>
                  <h2 id="voice-call-title" className="font-display text-xl font-bold text-midnight">
                    Calling…
                  </h2>
                  <p className="mt-1 text-sm text-muted">{activeCall.callee_name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void finishCall()}
                  disabled={isWorking}
                  className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-600 text-white disabled:opacity-50"
                  aria-label="Cancel call"
                >
                  <PhoneOff className="h-5 w-5" />
                </button>
              </div>
            ) : isConnectedCall ? (
              <div>
                <h2 id="voice-call-title" className="sr-only">Voice call</h2>
                <VoiceCallRoom
                  call={activeCall}
                  userId={userId}
                  onEnd={handleRoomEnd}
                />
              </div>
            ) : (
              <div className="space-y-4 text-center">
                <h2 id="voice-call-title" className="font-display text-lg font-bold text-midnight">
                  {TERMINAL_STATUS_LABELS[activeCall.status] || "Call finished."}
                </h2>
                <p className="text-sm text-muted">
                  {activeCall.caller_name} · {activeCall.callee_name}
                </p>
                {actionError && <p className="text-sm text-rose-700">{actionError}</p>}
                <button
                  type="button"
                  onClick={() => setActiveCall(null)}
                  className="rounded-xl bg-midnight px-4 py-2 text-sm font-semibold text-white"
                >
                  Close
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </VoiceCallContext.Provider>
  );
}
