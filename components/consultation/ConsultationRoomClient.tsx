"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Room,
  RoomEvent,
  VideoPresets,
  Track,
  type RemoteParticipant,
  type RemoteTrackPublication,
  ConnectionState,
  DisconnectReason,
  ConnectionQuality,
  type Participant,
} from "livekit-client";
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  PhoneOff,
  Share2,
  MessageSquare,
  Hand,
  Shield,
  Clock,
  Sparkles,
  Maximize2,
  Minimize2,
  Send,
  AlertCircle,
  Loader2,
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  FileDown,
  Subtitles,
} from "lucide-react";
import type { ConsultationTokenResult } from "@/lib/consultation/token";
import type {
  ConsultationMeeting,
  MeetingChatMessage,
} from "@/lib/types/database.types";
import {
  updateMeetingStatusAction,
  endConsultationMeetingAction,
  sendMeetingChatMessageAction,
  getMeetingChatHistoryAction,
} from "@/app/actions/consultation-meeting";
import { createClient } from "@/lib/supabase/client";
import { logConsultationDiagnostic } from "@/lib/consultation/diagnostics";

interface Props {
  meeting: ConsultationMeeting;
  tokenResult: ConsultationTokenResult;
  customerName: string;
  astrologerName: string;
  serviceType: string;
  scheduledAt: string;
  durationMinutes: number;
  consultationMode: string;
  isHost: boolean;
  partnerName: string;
}

type DeviceStatus = "ready" | "prompt" | "requesting" | "denied" | "not_found" | "in_use" | "off";

/**
 * True when the remote participant holds the host role. The role comes from the participant
 * metadata that the server embeds in the signed LiveKit token, so peers cannot forge it.
 */
function isHostParticipant(participant?: RemoteParticipant): boolean {
  if (!participant?.metadata) return false;
  try {
    return JSON.parse(participant.metadata)?.role === "host";
  } catch {
    return false;
  }
}

export function ConsultationRoomClient({
  meeting,
  tokenResult,
  serviceType,
  durationMinutes,
  consultationMode,
  isHost,
  partnerName,
}: Props) {
  const router = useRouter();
  const isAudioOnlyMode = consultationMode === "Call" || consultationMode?.toLowerCase() === "voice";

  // Pre-join vs Active Meeting
  const [hasJoined, setHasJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);

  // Media state
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(!isAudioOnlyMode);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);

  // Device selection & status
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string>("");
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [cameraStatus, setCameraStatus] = useState<DeviceStatus>(isAudioOnlyMode ? "off" : "requesting");
  const [micStatus, setMicStatus] = useState<DeviceStatus>("requesting");
  const [permissionErrorMessage, setPermissionErrorMessage] = useState<string | null>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);

  // Panels & UI
  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [activeReaction, setActiveReaction] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // In-Call Chat
  const [chatMessages, setChatMessages] = useState<MeetingChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // LiveKit Room & Video Elements
  const roomRef = useRef<Room | null>(null);
  const localPreviewVideoRef = useRef<HTMLVideoElement>(null);
  const localRoomVideoRef = useRef<HTMLVideoElement>(null);
  const remoteRoomVideoRef = useRef<HTMLVideoElement>(null);
  const screenShareVideoRef = useRef<HTMLVideoElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Participants
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [remoteScreenTrack, setRemoteScreenTrack] = useState<MediaStreamTrack | null>(null);

  // Synchronized Termination & Instant Completion State
  const [isConcluding, setIsConcluding] = useState(false);
  const [concludedMessage, setConcludedMessage] = useState<string | null>(null);
  const [showEndConfirmModal, setShowEndConfirmModal] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const isTerminatedRef = useRef(false);

  // Network Quality & Live Transcription
  const [myQuality, setMyQuality] = useState<ConnectionQuality>(ConnectionQuality.Excellent);
  const [transcriptionOpen, setTranscriptionOpen] = useState(false);
  const [transcriptLines, setTranscriptLines] = useState<Array<{ timestamp: string; speaker: string; text: string }>>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const toggleTranscription = useCallback(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Live speech transcription is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    if (isTranscribing) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      setIsTranscribing(false);
    } else {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = "en-IN";

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onresult = (event: any) => {
          const current = event.resultIndex;
          const transcript = event.results[current][0].transcript;
          if (transcript.trim()) {
            setTranscriptLines((prev) => [
              ...prev,
              {
                timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
                speaker: isHost ? "Astrologer" : "Seeker",
                text: transcript.trim(),
              },
            ]);
          }
        };

        recognition.onerror = () => {
          setIsTranscribing(false);
        };

        recognition.start();
        recognitionRef.current = recognition;
        setIsTranscribing(true);
      } catch (e) {
        console.warn("[transcription] Could not start speech recognition:", e);
      }
    }
  }, [isTranscribing, isHost]);

  const downloadTranscript = useCallback(() => {
    if (transcriptLines.length === 0) return;
    const content =
      `Karmic Ascension Consultation Session Transcript\n` +
      `Date: ${new Date().toLocaleDateString()}\n` +
      `Participants: ${isHost ? "Astrologer (Host)" : partnerName} & ${isHost ? partnerName : "Seeker"}\n` +
      `============================================================\n\n` +
      transcriptLines.map((l) => `[${l.timestamp}] ${l.speaker}: ${l.text}`).join("\n\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `consultation-transcript-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [transcriptLines, isHost, partnerName]);

  // Refs mirror state for LiveKit event handlers, which are registered once and would
  // otherwise read stale values.
  const chatOpenRef = useRef(false);
  const chatCountRef = useRef(0);
  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);
  useEffect(() => {
    chatCountRef.current = chatMessages.length;
  }, [chatMessages]);

  // Keyboard navigation & accessibility: Escape to dismiss modals and sidebars
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showEndConfirmModal) {
          setShowEndConfirmModal(false);
        } else if (chatOpen) {
          setChatOpen(false);
        } else if (transcriptionOpen) {
          setTranscriptionOpen(false);
        } else if (participantsOpen) {
          setParticipantsOpen(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showEndConfirmModal, chatOpen, transcriptionOpen, participantsOpen]);

  // -------------------------------------------------------------
  // 1. RECOVERY-AWARE MEDIA DEVICE DISCOVERY & INITIALIZATION
  // -------------------------------------------------------------
  const refreshDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audios = devices.filter((d) => d.kind === "audioinput");
      const videos = devices.filter((d) => d.kind === "videoinput");

      setAudioDevices(audios);
      setVideoDevices(videos);

      setSelectedAudioId((curr) => {
        if (curr && audios.some((a) => a.deviceId === curr)) return curr;
        return audios[0]?.deviceId || "";
      });

      setSelectedVideoId((curr) => {
        if (curr && videos.some((v) => v.deviceId === curr)) return curr;
        return videos[0]?.deviceId || "";
      });
    } catch (err) {
      console.warn("[consultation-devices] Enumeration error:", err);
    }
  }, []);

  const setupAudioMeter = useCallback((stream: MediaStream) => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    const audioTracks = stream.getAudioTracks();
    if (!audioTracks[0]) {
      setAudioLevel(0);
      return;
    }

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const pcmData = new Uint8Array(analyser.frequencyBinCount);

      const updateMeter = () => {
        if (!analyser || audioCtx.state === "closed") return;
        analyser.getByteFrequencyData(pcmData);
        let sum = 0;
        for (let i = 0; i < pcmData.length; i++) {
          sum += pcmData[i];
        }
        const avg = sum / pcmData.length;
        const level = Math.min(100, Math.round((avg / 128) * 100));
        setAudioLevel(level);
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };

      updateMeter();
    } catch (err) {
      console.warn("[consultation-meter] Web Audio API init skipped:", err);
    }
  }, []);

  const startPreviewStream = useCallback(
    async (requestedAudioId?: string, requestedVideoId?: string) => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setCameraStatus("not_found");
        setMicStatus("not_found");
        setPermissionErrorMessage("MediaDevices API is not supported in this browser environment.");
        return;
      }

      setPermissionErrorMessage(null);
      setCameraStatus(isAudioOnlyMode ? "off" : "requesting");
      setMicStatus("requesting");

      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }

      const wantVideo = !isAudioOnlyMode && isVideoOn;
      const audioConstraints: boolean | MediaTrackConstraints = requestedAudioId
        ? { deviceId: { exact: requestedAudioId } }
        : true;
      const videoConstraints: boolean | MediaTrackConstraints = wantVideo
        ? requestedVideoId
          ? { deviceId: { exact: requestedVideoId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } }
        : false;

      let acquiredStream: MediaStream | null = null;
      let camOk = false;
      let micOk = false;

      // 1. Primary unified acquisition attempt
      if (wantVideo) {
        try {
          acquiredStream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints,
            video: videoConstraints,
          });
          camOk = true;
          micOk = true;
        } catch (combinedErr) {
          console.warn("[consultation-preview] Combined media request failed, attempting separate:", combinedErr);
        }
      }

      // 2. Fallback to individual stream acquisition
      if (!acquiredStream) {
        let audioStream: MediaStream | null = null;
        let videoStream: MediaStream | null = null;
        let micErr: Error | null = null;
        let camErr: Error | null = null;

        try {
          audioStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
          micOk = true;
        } catch (err) {
          micErr = err instanceof Error ? err : new Error(String(err));
          console.warn("[consultation-preview] Audio acquisition fallback failed:", err);
        }

        if (wantVideo) {
          try {
            videoStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
            camOk = true;
          } catch (err) {
            camErr = err instanceof Error ? err : new Error(String(err));
            console.warn("[consultation-preview] Video acquisition fallback failed:", err);
          }
        }

        const combinedTracks: MediaStreamTrack[] = [
          ...(audioStream ? audioStream.getAudioTracks() : []),
          ...(videoStream ? videoStream.getVideoTracks() : []),
        ];

        if (combinedTracks.length > 0) {
          acquiredStream = new MediaStream(combinedTracks);
        } else {
          const isDenied = micErr?.name === "NotAllowedError" || camErr?.name === "NotAllowedError";
          if (isDenied) {
            setPermissionErrorMessage(
              "Camera or microphone permissions were blocked. Please click the lock or camera icon in your address bar to allow access, then click 'Retry Device Access'."
            );
          } else {
            setPermissionErrorMessage(
              "No active camera or microphone could be found. You can still join using audio-only or text chat."
            );
          }
        }
      }

      setMicStatus(micOk ? "ready" : "denied");
      setCameraStatus(wantVideo ? (camOk ? "ready" : "denied") : "off");

      if (acquiredStream) {
        previewStreamRef.current = acquiredStream;
        setPreviewStream(acquiredStream);

        if (localPreviewVideoRef.current && camOk) {
          localPreviewVideoRef.current.srcObject = acquiredStream;
          localPreviewVideoRef.current.play().catch(() => {});
        }

        if (micOk) {
          setupAudioMeter(acquiredStream);
        }

        void refreshDevices();
      }
    },
    [consultationMode, isVideoOn, refreshDevices, setupAudioMeter]
  );

  useEffect(() => {
    if (hasJoined) return;

    void refreshDevices();
    void startPreviewStream();

    const handleDeviceChange = () => {
      void refreshDevices();
    };
    navigator.mediaDevices?.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices?.removeEventListener("devicechange", handleDeviceChange);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        void audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasJoined]);

  useEffect(() => {
    if (!hasJoined && localPreviewVideoRef.current && previewStream) {
      localPreviewVideoRef.current.srcObject = isVideoOn ? previewStream : null;
      if (isVideoOn) {
        localPreviewVideoRef.current.play().catch(() => {});
      }
    }
  }, [hasJoined, isVideoOn, previewStream, cameraStatus]);

  const handleSelectAudioDevice = async (deviceId: string) => {
    setSelectedAudioId(deviceId);
    if (!hasJoined) {
      await startPreviewStream(deviceId, selectedVideoId);
    } else if (roomRef.current) {
      await roomRef.current.switchActiveDevice("audioinput", deviceId);
    }
  };

  const handleSelectVideoDevice = async (deviceId: string) => {
    setSelectedVideoId(deviceId);
    if (!hasJoined) {
      await startPreviewStream(selectedAudioId, deviceId);
    } else if (roomRef.current) {
      await roomRef.current.switchActiveDevice("videoinput", deviceId);
    }
  };

  // Chat is server-authoritative: peers only send a lightweight signal over the data channel and
  // every client re-reads the persisted history. This prevents a participant from spoofing messages
  // (names, roles, content) to the other side and keeps ordering/deduplication correct.
  const refreshChatFromServer = useCallback(async () => {
    const res = await getMeetingChatHistoryAction(meeting.id);
    if (res.success && res.messages) {
      const added = res.messages.length - chatCountRef.current;
      setChatMessages(res.messages);
      if (added > 0 && !chatOpenRef.current) {
        setUnreadChatCount((prev) => prev + added);
      }
    }
  }, [meeting.id]);

  useEffect(() => {
    async function loadChat() {
      const res = await getMeetingChatHistoryAction(meeting.id);
      if (res.success && res.messages) {
        setChatMessages(res.messages);
      }
    }
    void loadChat();
  }, [meeting.id]);

  useEffect(() => {
    if (!hasJoined) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [hasJoined]);

  useEffect(() => {
    if (chatOpen && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, chatOpen]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // -------------------------------------------------------------
  // SYNCHRONIZED TERMINATION & INSTANT CLEANUP
  // -------------------------------------------------------------
  const cleanupAndExit = useCallback(
    (message?: string) => {
      if (isTerminatedRef.current) return;
      isTerminatedRef.current = true;

      if (message) {
        setConcludedMessage(message);
      }
      setIsConcluding(true);

      // Stop audio meter
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }

      // Close AudioContext
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        void audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }

      // Stop preview tracks
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }

      // Stop local room tracks and disconnect
      if (roomRef.current) {
        try {
          roomRef.current.localParticipant.trackPublications.forEach((pub) => {
            if (pub.track) {
              pub.track.stop();
            }
          });
          if (roomRef.current.state !== ConnectionState.Disconnected) {
            roomRef.current.disconnect();
          }
        } catch (err) {
          console.warn("[consultation-cleanup] Notice on disconnect:", err);
        }
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("karmicascension:booking-updated"));
      }

      const exitPath = isHost ? "/astrologer/bookings" : "/customer/bookings";
      setTimeout(() => {
        router.replace(exitPath);
      }, 1200);
    },
    [isHost, router]
  );

  // Supabase Realtime fallback: instantly reacts to database meeting ended or booking completed
  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
    try {
      const supabase = createClient();
      channel = supabase
        .channel(`meeting-live-sync-${meeting.id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "consultation_meetings",
            filter: `id=eq.${meeting.id}`,
          },
          (payload) => {
            const updated = payload.new as ConsultationMeeting;
            if (updated && updated.status === "ended") {
              cleanupAndExit("The consultation session has concluded.");
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "customer_bookings",
            filter: `id=eq.${meeting.booking_id}`,
          },
          (payload) => {
            const updated = payload.new as { status?: string };
            if (updated && updated.status === "completed") {
              cleanupAndExit("The consultation session has concluded.");
            }
          }
        )
        .subscribe();
    } catch (err) {
      console.warn("[consultation-room] Realtime sync init notice:", err);
    }

    return () => {
      if (channel) {
        createClient().removeChannel(channel);
      }
    };
  }, [meeting.id, meeting.booking_id, cleanupAndExit]);

  // -------------------------------------------------------------
  // 2. JOIN LIVEKIT CLOUD WEBRTC CONSULTATION ROOM
  // -------------------------------------------------------------
  const handleJoinMeeting = async () => {
    setConnecting(true);
    setConnectionError(null);

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach((t) => t.stop());
      previewStreamRef.current = null;
    }

    try {
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
          resolution: VideoPresets.h720.resolution,
          deviceId: selectedVideoId || undefined,
        },
        audioCaptureDefaults: {
          deviceId: selectedAudioId || undefined,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      roomRef.current = room;

      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        setConnectionState(state);
      });

      room.on(RoomEvent.ConnectionQualityChanged, (quality: ConnectionQuality, p: Participant) => {
        if (p === room.localParticipant) {
          setMyQuality(quality);
        }
      });

      room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        setRemoteParticipants((prev) => [...prev.filter((p) => p.sid !== participant.sid), participant]);
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        setRemoteParticipants((prev) => prev.filter((p) => p.sid !== participant.sid));
      });

      room.on(
        RoomEvent.TrackSubscribed,
        (track: Track, pub: RemoteTrackPublication) => {
          if (track.kind === Track.Kind.Video) {
            if (pub.source === Track.Source.ScreenShare) {
              setRemoteScreenTrack(track.mediaStreamTrack);
              if (screenShareVideoRef.current) {
                track.attach(screenShareVideoRef.current);
              }
            } else if (remoteRoomVideoRef.current) {
              track.attach(remoteRoomVideoRef.current);
            }
          } else if (track.kind === Track.Kind.Audio) {
            track.attach();
          }
        }
      );

      room.on(RoomEvent.TrackUnsubscribed, (track: Track, pub: RemoteTrackPublication) => {
        if (pub.source === Track.Source.ScreenShare) {
          setRemoteScreenTrack(null);
        }
        track.detach();
      });

      room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant) => {
        try {
          const str = new TextDecoder().decode(payload);
          const data = JSON.parse(str);
          if (data.type === "consultation_ended") {
            // Only the server (no participant) or a host may end the session. The metadata role is
            // embedded in the server-signed token, so a customer cannot claim it.
            const fromServer = !participant;
            if (!fromServer && !isHostParticipant(participant)) return;
            if (data.meetingId && data.meetingId !== meeting.id) return;
            cleanupAndExit("The astrologer has concluded this consultation session.");
            return;
          }
          if (data.type === "reaction") {
            if (typeof data.emoji === "string" && data.emoji.length > 0 && data.emoji.length <= 8) {
              setActiveReaction(data.emoji);
              setTimeout(() => setActiveReaction(null), 3000);
            }
          } else if (data.type === "chat_message") {
            void refreshChatFromServer();
          }
        } catch {}
      });

      room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        if (!isTerminatedRef.current) {
          const msg =
            reason === DisconnectReason.ROOM_DELETED ||
            reason === DisconnectReason.ROOM_CLOSED
              ? "The consultation session has been concluded by the host."
              : "Disconnected from consultation room.";
          cleanupAndExit(msg);
        }
      });

      // Connect to LiveKit server
      await room.connect(tokenResult.serverUrl, tokenResult.token);

      // Publish local tracks
      if (isVideoOn && !isAudioOnlyMode && cameraStatus !== "denied") {
        try {
          await room.localParticipant.setCameraEnabled(true);
        } catch (camErr) {
          console.warn("[consultation-room] Camera publish skipped:", camErr);
          setIsVideoOn(false);
        }
      }

      if (isMicOn && micStatus !== "denied") {
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
        } catch (micErr) {
          console.warn("[consultation-room] Microphone publish skipped:", micErr);
          setIsMicOn(false);
        }
      }

      setRemoteParticipants(Array.from(room.remoteParticipants.values()));
      void updateMeetingStatusAction(meeting.id, "active");
      setHasJoined(true);

      logConsultationDiagnostic("room_connected", {
        bookingId: meeting.booking_id,
        role: isHost ? "astrologer" : "customer",
        roomName: meeting.room_name,
        connectionState: room.state,
      });
    } catch (err) {
      console.error("[consultation-room] Connection error:", err);
      logConsultationDiagnostic("connection_error", {
        bookingId: meeting.booking_id,
        role: isHost ? "astrologer" : "customer",
        connectionState: "error",
      });
      setConnectionError(
        err instanceof Error
          ? err.message
          : "Failed to connect to the video consultation server. Please check your network and try again."
      );
    } finally {
      setConnecting(false);
    }
  };

  useEffect(() => {
    if (hasJoined && roomRef.current) {
      const camPub = roomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
      if (camPub?.videoTrack && localRoomVideoRef.current) {
        camPub.videoTrack.attach(localRoomVideoRef.current);
      }
    }
  }, [hasJoined, isVideoOn]);

  useEffect(() => {
    if (!hasJoined || !roomRef.current) return;

    for (const participant of roomRef.current.remoteParticipants.values()) {
      for (const pub of participant.videoTrackPublications.values()) {
        if (pub.track && pub.isSubscribed) {
          if (pub.source === Track.Source.ScreenShare && screenShareVideoRef.current) {
            pub.track.attach(screenShareVideoRef.current);
          } else if (remoteRoomVideoRef.current) {
            pub.track.attach(remoteRoomVideoRef.current);
          }
        }
      }
      for (const pub of participant.audioTrackPublications.values()) {
        if (pub.track && pub.isSubscribed) {
          pub.track.attach();
        }
      }
    }
  }, [hasJoined, remoteParticipants]);

  const toggleMic = async () => {
    if (!roomRef.current) {
      setIsMicOn((prev) => !prev);
      return;
    }
    const next = !isMicOn;
    await roomRef.current.localParticipant.setMicrophoneEnabled(next);
    setIsMicOn(next);
  };

  const toggleVideo = async () => {
    if (isAudioOnlyMode) return;
    if (!roomRef.current) {
      setIsVideoOn((prev) => !prev);
      return;
    }
    const next = !isVideoOn;
    await roomRef.current.localParticipant.setCameraEnabled(next);
    setIsVideoOn(next);
    if (next) {
      setTimeout(() => {
        const camPub = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Camera);
        if (camPub?.videoTrack && localRoomVideoRef.current) {
          camPub.videoTrack.attach(localRoomVideoRef.current);
        }
      }, 200);
    }
  };

  const toggleScreenShare = async () => {
    if (!roomRef.current) return;
    try {
      const next = !isScreenSharing;
      await roomRef.current.localParticipant.setScreenShareEnabled(next);
      setIsScreenSharing(next);
    } catch (err) {
      console.warn("[consultation-room] Screen share cancelled:", err);
      setIsScreenSharing(false);
    }
  };

  const handleSendReaction = (emoji: string) => {
    setActiveReaction(emoji);
    setTimeout(() => setActiveReaction(null), 3000);

    if (roomRef.current) {
      const payload = new TextEncoder().encode(JSON.stringify({ type: "reaction", emoji }));
      void roomRef.current.localParticipant.publishData(payload, { reliable: true });
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || sendingMsg) return;

    const text = chatInput.trim();
    setChatInput("");
    setChatError(null);
    setSendingMsg(true);

    try {
      const res = await sendMeetingChatMessageAction(meeting.id, text);
      if (res.success && res.message) {
        const saved = res.message;
        setChatMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]));

        if (roomRef.current) {
          // Signal only; receivers fetch the persisted message from the server
          const payload = new TextEncoder().encode(JSON.stringify({ type: "chat_message" }));
          void roomRef.current.localParticipant.publishData(payload, { reliable: true });
        }
      } else {
        // Restore the text so the user does not lose it, and say why it failed (e.g. meeting ended)
        setChatInput(text);
        setChatError(res.error || "Message could not be sent.");
      }
    } finally {
      setSendingMsg(false);
    }
  };

  const handleLeaveOrEnd = async (endForAll = false) => {
    if (endForAll && isHost) {
      setEndError(null);
      setIsConcluding(true);
      setConcludedMessage("Concluding consultation and marking booking as completed...");

      // The server is authoritative: it persists the ended meeting + completed booking, broadcasts the
      // termination packet and closes the LiveKit room. Only leave the room once that succeeded.
      let failure: string | null = null;
      try {
        const res = await endConsultationMeetingAction(meeting.id);
        if (!res.success) failure = res.error || "Unable to end the consultation.";
      } catch (err) {
        console.error("[consultation-room] endConsultationMeetingAction error:", err);
        failure = "Network error while ending the consultation.";
      }

      if (failure) {
        // Do not claim success: stay in the room and let the host retry (the server action is idempotent)
        setIsConcluding(false);
        setConcludedMessage(null);
        setEndError(failure);
        setShowEndConfirmModal(true);
        return;
      }

      cleanupAndExit("Consultation concluded. Redirecting to your bookings...");
    } else {
      cleanupAndExit();
    }
  };

  useEffect(() => {
    return () => {
      if (roomRef.current && roomRef.current.state !== ConnectionState.Disconnected) {
        roomRef.current.disconnect();
      }
    };
  }, []);

  // -------------------------------------------------------------
  // VIEW 1: PRE-JOIN PREVIEW SCREEN
  // -------------------------------------------------------------
  if (!hasJoined) {
    return (
      <div className="min-h-screen bg-midnight text-parchment flex flex-col justify-between p-4 sm:p-8">
        <div className="flex items-center justify-between max-w-5xl mx-auto w-full">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-xs text-parchment/70 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" /> Return to Bookings
          </button>
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-midnight/80 px-3.5 py-1 text-xs text-gold">
            <Sparkles className="h-3.5 w-3.5 text-gold-deep" /> Verified Vedic Consultation Room
          </div>
        </div>

        <div className="max-w-4xl mx-auto w-full my-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 flex flex-col items-center">
            <div className="relative w-full aspect-video bg-midnight/90 rounded-2xl border-2 border-gold/40 shadow-2xl overflow-hidden flex items-center justify-center">
              {isVideoOn && consultationMode !== "Call" && cameraStatus === "ready" ? (
                <video
                  ref={(el) => {
                    localPreviewVideoRef.current = el;
                    if (el && previewStream) {
                      if (el.srcObject !== previewStream) {
                        el.srcObject = previewStream;
                      }
                      el.play().catch(() => {});
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform scale-x-[-1]"
                />
              ) : (
                <div className="flex flex-col items-center text-center p-6 max-w-sm">
                  <div className="h-20 w-20 rounded-full bg-gold/20 flex items-center justify-center text-2xl font-bold text-gold border border-gold/40 mb-3">
                    {partnerName.slice(0, 2).toUpperCase()}
                  </div>
                  {cameraStatus === "requesting" ? (
                    <div className="flex items-center gap-2 text-gold-light text-xs">
                      <Loader2 className="h-4 w-4 animate-spin text-gold" />
                      <span>Requesting camera access…</span>
                    </div>
                  ) : cameraStatus === "denied" ? (
                    <>
                      <p className="text-sm font-semibold text-rose-300">Camera Permission Blocked</p>
                      <p className="text-xs text-parchment/70 mt-1">
                        Please grant camera access in your browser or join with audio only.
                      </p>
                    </>
                  ) : cameraStatus === "not_found" ? (
                    <>
                      <p className="text-sm font-semibold text-parchment">No Camera Detected</p>
                      <p className="text-xs text-parchment/60 mt-1">Audio-only mode is available.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-white">Camera is turned off</p>
                      <p className="text-xs text-muted mt-1">You can turn it on below anytime</p>
                    </>
                  )}
                </div>
              )}

              <div className="absolute bottom-3 left-3 bg-midnight/90 backdrop-blur-md border border-gold/30 rounded-xl px-3 py-1.5 flex items-center gap-2 shadow-lg">
                {isMicOn && micStatus === "ready" ? (
                  <Mic className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <MicOff className="h-3.5 w-3.5 text-rose-400" />
                )}
                <div className="w-16 h-1.5 bg-midnight/70 rounded-full overflow-hidden border border-white/10">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-75"
                    style={{ width: `${isMicOn && micStatus === "ready" ? Math.max(audioLevel, 4) : 0}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-parchment/80">
                  {isMicOn && micStatus === "ready"
                    ? audioLevel > 5
                      ? "Speaking"
                      : "Mic Active"
                    : "Muted"}
                </span>
              </div>

              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMicOn(!isMicOn)}
                  className={`p-2.5 rounded-full backdrop-blur-md border transition-all cursor-pointer ${
                    isMicOn
                      ? "bg-midnight/80 border-gold/40 text-white hover:bg-gold/20"
                      : "bg-rose-500/90 border-rose-400 text-white"
                  }`}
                  aria-label={isMicOn ? "Mute Microphone" : "Unmute Microphone"}
                >
                  {isMicOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4 text-white" />}
                </button>

                {consultationMode !== "Call" && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isVideoOn;
                      setIsVideoOn(next);
                      if (next && cameraStatus !== "ready") {
                        void startPreviewStream(selectedAudioId, selectedVideoId);
                      }
                    }}
                    className={`p-2.5 rounded-full backdrop-blur-md border transition-all cursor-pointer ${
                      isVideoOn && cameraStatus === "ready"
                        ? "bg-midnight/80 border-gold/40 text-white hover:bg-gold/20"
                        : "bg-rose-500/90 border-rose-400 text-white"
                    }`}
                    aria-label={isVideoOn ? "Turn off camera" : "Turn on camera"}
                  >
                    {isVideoOn && cameraStatus === "ready" ? (
                      <VideoIcon className="h-4 w-4" />
                    ) : (
                      <VideoOff className="h-4 w-4 text-white" />
                    )}
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 mt-3 w-full">
              <div className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-midnight/70 border border-gold/20">
                {micStatus === "ready" ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                ) : (
                  <AlertCircle className="h-3 w-3 text-amber-400" />
                )}
                <span>Microphone: {micStatus === "ready" ? "Available" : "Connecting…"}</span>
              </div>

              {!isAudioOnlyMode && (
                <div className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-midnight/70 border border-gold/20">
                  {cameraStatus === "ready" ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-amber-400" />
                  )}
                  <span>Camera: {cameraStatus === "ready" ? "Available" : "Connecting…"}</span>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col space-y-5">
            <div>
              <p className="text-xs uppercase tracking-wider text-gold-deep font-semibold">
                {consultationMode} Consultation
              </p>
              <h1 className="text-2xl font-bold font-display text-white mt-1">{partnerName}</h1>
              <p className="text-xs text-parchment/70 mt-1">
                {serviceType} • {durationMinutes} Minutes
              </p>
            </div>

            {permissionErrorMessage && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/40 p-3 text-xs text-amber-200 flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{permissionErrorMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => startPreviewStream(selectedAudioId, selectedVideoId)}
                  className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400 text-midnight font-semibold text-xs hover:bg-amber-300 transition-colors cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Retry Device Access
                </button>
              </div>
            )}

            <div className="space-y-3.5 bg-midnight/70 rounded-xl p-4 border border-gold/30 shadow-lg">
              <div>
                <label className="text-[11px] font-semibold text-parchment/90 block mb-1">Microphone</label>
                <select
                  value={selectedAudioId || (audioDevices[0]?.deviceId ?? "")}
                  onChange={(e) => handleSelectAudioDevice(e.target.value)}
                  className="w-full text-xs rounded-lg border border-gold/30 bg-midnight/95 py-2 px-3 text-white focus:outline-none focus:border-gold cursor-pointer"
                  style={{ colorScheme: "dark" }}
                >
                  {audioDevices.length === 0 ? (
                    <option value="" className="bg-gray-900 text-white">Default Microphone</option>
                  ) : (
                    audioDevices.map((d, index) => (
                      <option key={d.deviceId || index} value={d.deviceId} className="bg-gray-900 text-white">
                        {d.label || `Microphone ${index + 1}`}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {consultationMode !== "Call" && (
                <div>
                  <label className="text-[11px] font-semibold text-parchment/90 block mb-1">Camera</label>
                  <select
                    value={selectedVideoId || (videoDevices[0]?.deviceId ?? "")}
                    onChange={(e) => handleSelectVideoDevice(e.target.value)}
                    className="w-full text-xs rounded-lg border border-gold/30 bg-midnight/95 py-2 px-3 text-white focus:outline-none focus:border-gold cursor-pointer"
                    style={{ colorScheme: "dark" }}
                  >
                    {videoDevices.length === 0 ? (
                      <option value="" className="bg-gray-900 text-white">Default Camera</option>
                    ) : (
                      videoDevices.map((d, index) => (
                        <option key={d.deviceId || index} value={d.deviceId} className="bg-gray-900 text-white">
                          {d.label || `Camera ${index + 1}`}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}
            </div>

            {connectionError && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/20 border border-rose-500/50 text-xs text-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{connectionError}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleJoinMeeting}
              disabled={connecting}
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-gold via-gold-deep to-amber-600 font-semibold text-sm text-midnight shadow-lg hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {connecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-midnight" />
                  <span>Connecting to Consultation Room…</span>
                </>
              ) : (
                <>
                  <VideoIcon className="h-4 w-4" />
                  <span>Join Consultation Room</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-2 text-[11px] text-parchment/60 justify-center">
              <Shield className="h-3.5 w-3.5 text-gold-deep" />
              <span>Encrypted peer-to-peer WebRTC consultation session</span>
            </div>
          </div>
        </div>

        <div className="text-center text-[11px] text-parchment/50">
          Karmic Ascension In-House Video Conferencing • All consultation notes remain confidential
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW 2: ACTIVE CONSULTATION ROOM
  // -------------------------------------------------------------
  return (
    <div
      className={`fixed inset-0 z-50 bg-midnight text-parchment flex flex-col select-none overflow-hidden ${
        isFullscreen ? "p-0" : ""
      }`}
    >
      {activeReaction && (
        <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none animate-bounce">
          <div className="text-6xl drop-shadow-2xl">{activeReaction}</div>
        </div>
      )}

      {connectionState === ConnectionState.Reconnecting && (
        <div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-50 bg-amber-600 text-white px-4 py-1.5 rounded-full text-xs font-semibold shadow-xl flex items-center gap-2 animate-pulse">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          <span>Reconnecting to consultation server…</span>
        </div>
      )}

      <header className="h-14 shrink-0 border-b border-gold/20 bg-midnight/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs text-gold">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>LIVE</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate max-w-[200px] sm:max-w-xs">{partnerName}</p>
            <p className="text-[10px] text-parchment/70 truncate hidden sm:block">
              {serviceType} • {durationMinutes}m
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-gold-light bg-midnight/70 px-3 py-1 rounded-lg border border-gold/20">
            <Clock className="h-3.5 w-3.5 text-gold" />
            <span>{formatTime(elapsedSeconds)}</span>
          </div>

          <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-midnight/80 border border-gold/30 text-[11px] text-parchment/80"
            title={`Connection Quality: ${myQuality}`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                myQuality === ConnectionQuality.Excellent || myQuality === ConnectionQuality.Good
                  ? "bg-emerald-400"
                  : myQuality === ConnectionQuality.Poor
                  ? "bg-amber-400"
                  : "bg-rose-400"
              }`}
            />
            <span className="capitalize">{myQuality === ConnectionQuality.Excellent ? "HD WebRTC" : myQuality}</span>
          </div>

          <button
            type="button"
            onClick={() => {
              setTranscriptionOpen(!transcriptionOpen);
              if (!transcriptionOpen && !isTranscribing) {
                toggleTranscription();
              }
            }}
            aria-label="Toggle live transcript"
            className={`p-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs ${
              transcriptionOpen ? "bg-gold text-midnight" : "text-parchment/70 hover:text-white hover:bg-gold/10"
            }`}
          >
            <Subtitles className="h-4 w-4" />
            <span className="hidden md:inline">Transcripts</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
                setIsFullscreen(true);
              } else {
                document.exitFullscreen().catch(() => {});
                setIsFullscreen(false);
              }
            }}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="p-2 rounded-lg text-parchment/70 hover:text-white hover:bg-gold/10 transition-colors cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <div className="flex-1 relative flex min-h-0 overflow-hidden">
        <div className="flex-1 relative p-3 sm:p-5 flex items-center justify-center bg-radial from-midnight/80 to-black overflow-hidden">
          <div className="relative w-full h-full max-w-6xl max-h-[82vh] rounded-2xl bg-midnight/60 border border-gold/30 shadow-2xl overflow-hidden flex items-center justify-center">
            {remoteScreenTrack ? (
              <video
                ref={(el) => {
                  screenShareVideoRef.current = el;
                  if (el && remoteScreenTrack) {
                    el.srcObject = new MediaStream([remoteScreenTrack]);
                    el.play().catch(() => {});
                  }
                }}
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            ) : (
              <video
                ref={(el) => {
                  remoteRoomVideoRef.current = el;
                  if (el && roomRef.current) {
                    for (const participant of roomRef.current.remoteParticipants.values()) {
                      for (const pub of participant.videoTrackPublications.values()) {
                        if (pub.track && pub.isSubscribed && pub.source !== Track.Source.ScreenShare) {
                          pub.track.attach(el);
                        }
                      }
                    }
                  }
                }}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            )}

            {remoteParticipants.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-midnight/90 z-0">
                <div className="h-24 w-24 rounded-full bg-gradient-to-br from-champagne via-gold to-gold-deep flex items-center justify-center text-3xl font-bold text-midnight shadow-lg border-2 border-white mb-4">
                  {partnerName.slice(0, 2).toUpperCase()}
                </div>
                <h3 className="text-base font-semibold text-white">{partnerName}</h3>
                <p className="text-xs text-parchment/70 mt-1">Waiting for participant to connect to the session…</p>
                <div className="flex items-center gap-2 mt-4 text-[11px] text-gold">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Session room is open and waiting</span>
                </div>
              </div>
            )}

            <div className="absolute top-3 left-3 bg-midnight/80 backdrop-blur-sm border border-gold/30 rounded-lg px-2.5 py-1 text-xs text-white flex items-center gap-1.5 shadow z-10">
              <span className="font-semibold">{partnerName}</span>
              <span className="text-[10px] text-gold">{isHost ? "(Customer)" : "(Astrologer)"}</span>
            </div>

            <div className="absolute bottom-4 right-4 w-36 sm:w-48 aspect-video rounded-xl border-2 border-gold/60 bg-midnight/90 shadow-2xl overflow-hidden z-20">
              {isVideoOn && !isAudioOnlyMode ? (
                <video
                  ref={(el) => {
                    localRoomVideoRef.current = el;
                    if (el && roomRef.current) {
                      const camPub = roomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
                      if (camPub?.videoTrack) {
                        camPub.videoTrack.attach(el);
                      }
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform scale-x-[-1]"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-midnight text-xs font-semibold text-gold">
                  {isAudioOnlyMode ? "You (Voice Only)" : "You (Video Muted)"}
                </div>
              )}
              <div className="absolute bottom-1.5 left-1.5 bg-midnight/80 px-1.5 py-0.5 rounded text-[10px] text-white flex items-center gap-1">
                <span>You</span>
                {!isMicOn && <MicOff className="h-2.5 w-2.5 text-rose-400" />}
              </div>
            </div>
          </div>
        </div>

        {chatOpen && (
          <aside className="w-80 sm:w-96 shrink-0 border-l border-gold/30 bg-midnight/95 backdrop-blur-xl flex flex-col z-30">
            <div className="h-14 border-b border-gold/20 px-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-gold-deep" />
                <h3 className="text-sm font-semibold text-white">In-Call Chat</h3>
              </div>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                aria-label="Close chat"
                className="text-parchment/70 hover:text-white p-1 rounded cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div ref={chatScrollRef} aria-live="polite" className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
              {chatMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted p-4">
                  <MessageSquare className="h-8 w-8 text-gold/30 mb-2" />
                  <p className="font-semibold text-parchment">No messages yet</p>
                  <p className="text-[11px] mt-1 text-parchment/60">Send notes or questions during consultation.</p>
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-xl p-3 border ${
                      msg.sender_role === "host"
                        ? "bg-gold/10 border-gold/30 text-parchment"
                        : "bg-midnight/80 border-gold/20 text-white"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-gold-light mb-1">
                      <span className="font-bold">{msg.sender_name}</span>
                      <span>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-xs break-words">{msg.message}</p>
                  </div>
                ))
              )}
            </div>

            {chatError && (
              <p role="alert" className="px-3 py-2 text-[11px] text-rose-300 border-t border-rose-500/30 bg-rose-500/10">
                {chatError}
              </p>
            )}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-gold/20 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => {
                  setChatInput(e.target.value);
                  if (chatError) setChatError(null);
                }}
                placeholder="Type consultation message…"
                maxLength={1000}
                className="flex-1 bg-midnight/70 border border-gold/30 rounded-xl px-3 py-2 text-xs text-white placeholder:text-parchment/40 focus:outline-none focus:border-gold"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || sendingMsg}
                className="p-2.5 rounded-xl bg-gold-deep text-midnight hover:bg-gold transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </aside>
        )}

        {transcriptionOpen && (
          <aside className="w-80 sm:w-96 shrink-0 border-l border-gold/30 bg-midnight/95 backdrop-blur-xl flex flex-col z-30">
            <div className="h-14 border-b border-gold/20 px-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Subtitles className="h-4 w-4 text-gold-deep" />
                <h3 className="text-sm font-semibold text-white">Live Transcripts</h3>
                {isTranscribing && <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Transcribing live audio" />}
              </div>
              <div className="flex items-center gap-1">
                {transcriptLines.length > 0 && (
                  <button
                    type="button"
                    onClick={downloadTranscript}
                    title="Download Transcript"
                    className="p-1.5 rounded-lg text-gold hover:bg-gold/15 transition-colors cursor-pointer"
                  >
                    <FileDown className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setTranscriptionOpen(false)}
                  aria-label="Close transcripts"
                  className="text-parchment/70 hover:text-white p-1 rounded cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
              {transcriptLines.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted p-4">
                  <Subtitles className="h-8 w-8 text-gold/30 mb-2" />
                  <p className="font-semibold text-parchment">No transcript lines yet</p>
                  <p className="text-[11px] text-parchment/60 mt-1">
                    Spoken conversation will appear here in real-time. Click Start below to begin live captions.
                  </p>
                </div>
              ) : (
                transcriptLines.map((line, idx) => (
                  <div key={idx} className="rounded-xl p-3 border border-gold/20 bg-midnight/80 text-white space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-gold-light">
                      <span className="font-bold">{line.speaker}</span>
                      <span>{line.timestamp}</span>
                    </div>
                    <p className="text-xs break-words">{line.text}</p>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 border-t border-gold/20 flex items-center justify-between bg-midnight/90">
              <button
                type="button"
                onClick={toggleTranscription}
                className={`w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                  isTranscribing
                    ? "bg-rose-600 hover:bg-rose-700 text-white"
                    : "bg-gold-deep hover:bg-gold text-midnight"
                }`}
              >
                <Subtitles className="h-3.5 w-3.5" />
                <span>{isTranscribing ? "Pause Live Transcription" : "Start Live Transcription"}</span>
              </button>
            </div>
          </aside>
        )}
      </div>

      <footer className="h-20 shrink-0 border-t border-gold/30 bg-midnight/95 backdrop-blur-xl px-4 sm:px-8 flex items-center justify-between z-20">
        <div className="hidden sm:flex items-center gap-2 text-xs text-parchment/70">
          <Shield className="h-4 w-4 text-gold-deep" />
          <span className="truncate max-w-[150px]">{serviceType}</span>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3.5 mx-auto sm:mx-0">
          <button
            type="button"
            onClick={toggleMic}
            aria-label={isMicOn ? "Mute microphone" : "Unmute microphone"}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              isMicOn
                ? "bg-midnight/80 border-gold/40 text-white hover:bg-gold/20"
                : "bg-rose-600 border-rose-500 text-white hover:bg-rose-700"
            }`}
          >
            {isMicOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>

          {!isAudioOnlyMode && (
            <button
              type="button"
              onClick={toggleVideo}
              aria-label={isVideoOn ? "Turn off camera" : "Turn on camera"}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                isVideoOn
                  ? "bg-midnight/80 border-gold/40 text-white hover:bg-gold/20"
                  : "bg-rose-600 border-rose-500 text-white hover:bg-rose-700"
              }`}
            >
              {isVideoOn ? <VideoIcon className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </button>
          )}

          <button
            type="button"
            onClick={toggleScreenShare}
            aria-label={isScreenSharing ? "Stop sharing screen" : "Share screen"}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              isScreenSharing ? "bg-gold text-midnight border-gold-light" : "bg-midnight/80 border-gold/40 text-white hover:bg-gold/20"
            }`}
          >
            <Share2 className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => {
              setIsHandRaised(!isHandRaised);
              handleSendReaction(isHandRaised ? "✋" : "🙏");
            }}
            aria-label={isHandRaised ? "Lower hand" : "Raise hand"}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              isHandRaised ? "bg-gold/30 border-gold text-gold-light" : "bg-midnight/80 border-gold/40 text-white hover:bg-gold/20"
            }`}
          >
            <Hand className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-1 bg-midnight/80 border border-gold/30 rounded-2xl p-1" role="group" aria-label="Emoji reactions">
            {["🙏", "👍", "🪷", "❤️"].map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleSendReaction(emoji)}
                aria-label={`Send reaction ${emoji}`}
                className="hover:scale-125 transition-transform p-1.5 text-base cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setChatOpen(!chatOpen);
              setUnreadChatCount(0);
            }}
            aria-label={chatOpen ? "Close chat panel" : "Open chat panel"}
            className={`relative p-3.5 rounded-2xl border transition-all cursor-pointer ${
              chatOpen ? "bg-gold text-midnight border-gold-light" : "bg-midnight/80 border-gold/40 text-white hover:bg-gold/20"
            }`}
          >
            <MessageSquare className="h-5 w-5" />
            {unreadChatCount > 0 && !chatOpen && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow">
                {unreadChatCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (isHost) {
                setShowEndConfirmModal(true);
              } else {
                if (window.confirm("Leave this consultation room?")) {
                  void handleLeaveOrEnd(false);
                }
              }
            }}
            aria-label={isHost ? "Open end session options" : "Leave consultation room"}
            className="p-3.5 rounded-2xl bg-rose-600 border border-rose-500 text-white hover:bg-rose-700 transition-colors shadow-lg cursor-pointer"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>

        {isHost && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowEndConfirmModal(true)}
              aria-label="End session for all participants"
              className="px-3.5 py-2.5 rounded-xl border border-rose-500/60 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 shadow-md"
            >
              <PhoneOff className="h-4 w-4 text-rose-400" />
              <span>End Session for All</span>
            </button>
          </div>
        )}
      </footer>

      {/* Astrologer End/Leave Confirmation Modal */}
      {showEndConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="conclude-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
        >
          <div className="max-w-md w-full rounded-2xl border border-gold/40 bg-midnight p-6 shadow-2xl space-y-4">
            <div className="h-12 w-12 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <PhoneOff className="h-6 w-6" />
            </div>
            <h3 id="conclude-modal-title" className="text-lg font-bold font-display text-white">Conclude Consultation</h3>
            {endError && (
              <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/20 border border-rose-500/50 text-xs text-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{endError} You can try again.</span>
              </div>
            )}
            <p className="text-xs text-parchment/80 leading-relaxed">
              Would you like to end the session for all participants (marks the booking as Completed) or just leave the room?
            </p>
            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowEndConfirmModal(false);
                  void handleLeaveOrEnd(true);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>End Session for All (Mark Completed)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEndConfirmModal(false);
                  void handleLeaveOrEnd(false);
                }}
                className="w-full py-2.5 px-4 rounded-xl border border-gold/30 bg-midnight/80 hover:bg-gold/15 text-parchment font-medium text-xs transition-colors cursor-pointer"
              >
                Just Leave Room
              </button>
              <button
                type="button"
                onClick={() => setShowEndConfirmModal(false)}
                className="w-full py-2 px-4 rounded-xl text-parchment/60 hover:text-white text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Synchronized Termination Overlay */}
      {isConcluding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/95 backdrop-blur-md p-4">
          <div className="max-w-md w-full rounded-2xl border border-gold/40 bg-midnight p-6 sm:p-8 text-center shadow-2xl space-y-4">
            <div className="h-16 w-16 rounded-full bg-gold/15 border border-gold/40 flex items-center justify-center mx-auto text-gold">
              <Sparkles className="h-8 w-8 text-gold animate-pulse" />
            </div>
            <h2 className="text-xl font-bold font-display text-white">Consultation Concluded</h2>
            <p className="text-xs text-parchment/80 leading-relaxed">
              {concludedMessage || "The consultation session has ended. Redirecting to your bookings..."}
            </p>
            <div className="flex items-center justify-center gap-2 text-gold-light text-xs pt-2">
              <Loader2 className="h-4 w-4 animate-spin text-gold" />
              <span>Returning to your dashboard…</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
