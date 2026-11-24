"use client";

import React, { useState, useRef, useEffect, memo } from "react";
import {
  Send,
  Paperclip,
  Smile,
  X,
  Loader2,
  FileText,
  Edit2,
  Reply,
  QrCode,
} from "lucide-react";
import type { DirectMessage, DirectMessageAttachment } from "@/lib/chat/meta";

interface ChatComposerProps {
  onSendMessage: (text: string, attachments: DirectMessageAttachment[]) => Promise<void>;
  onTyping: (isTyping: boolean) => void;
  onUploadAttachment: (file: File) => Promise<DirectMessageAttachment | null>;
  editingMessage: DirectMessage | null;
  replyingTo: DirectMessage | null;
  onCancelEdit: () => void;
  onCancelReply: () => void;
  isSending: boolean;
  disabled?: boolean;
  onSharePaymentQR?: () => void;
}

export const ChatComposer = memo(function ChatComposer({
  onSendMessage,
  onTyping,
  onUploadAttachment,
  editingMessage,
  replyingTo,
  onCancelEdit,
  onCancelReply,
  isSending,
  disabled,
  onSharePaymentQR,
}: ChatComposerProps) {
  const [text, setText] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<DirectMessageAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingSentAtRef = useRef<number>(0);

  // Clean up pending typing timer on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        onTyping(false);
      }
    };
  }, [onTyping]);

  // Sync edit mode text
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.message);
      textareaRef.current?.focus();
    } else {
      setText("");
    }
  }, [editingMessage]);

  // Focus textarea when replying
  useEffect(() => {
    if (replyingTo) {
      textareaRef.current?.focus();
    }
  }, [replyingTo]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    // Throttled typing indicator (at most once per 900ms, auto-clears 1500ms after last keystroke)
    const now = Date.now();
    if (val.trim().length > 0) {
      if (now - lastTypingSentAtRef.current >= 900) {
        lastTypingSentAtRef.current = now;
        onTyping(true);
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        lastTypingSentAtRef.current = 0;
        onTyping(false);
      }, 1500);
    } else {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      lastTypingSentAtRef.current = 0;
      onTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = text.trim();
    if ((!trimmed && pendingAttachments.length === 0) || isSending || disabled) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    lastTypingSentAtRef.current = 0;
    onTyping(false);

    const attachmentsToSend = [...pendingAttachments];
    const textToSend = trimmed;

    // Reset local state immediately for instant feedback
    setText("");
    setPendingAttachments([]);

    try {
      await onSendMessage(textToSend, attachmentsToSend);
    } catch {
      // Restore draft if top-level unhandled exception occurs
      setText(textToSend);
      setPendingAttachments(attachmentsToSend);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File exceeds 10MB limit");
      return;
    }

    setUploadError(null);
    setIsUploading(true);

    const attachment = await onUploadAttachment(file);
    setIsUploading(false);

    if (attachment) {
      setPendingAttachments((prev) => [...prev, attachment]);
    } else {
      setUploadError("Upload failed");
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const insertEmoji = (emoji: string) => {
    setText((prev) => (prev ? `${prev} ${emoji}` : emoji));
    textareaRef.current?.focus();
  };

  return (
    <div className="shrink-0 border-t border-gold/20 bg-white">
      {/* Replying or Editing Banner */}
      {(replyingTo || editingMessage) && (
        <div className="px-4 py-2 bg-parchment/60 border-b border-gold/20 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 truncate text-midnight">
            {replyingTo ? (
              <>
                <Reply className="h-3.5 w-3.5 text-gold-deep shrink-0" />
                <span className="font-semibold text-[11px]">Replying to:</span>
                <span className="text-[11px] text-muted truncate">{replyingTo.message}</span>
              </>
            ) : (
              <>
                <Edit2 className="h-3.5 w-3.5 text-gold-deep shrink-0" />
                <span className="font-semibold text-[11px]">Editing message</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={editingMessage ? onCancelEdit : onCancelReply}
            className="p-1 text-muted hover:text-midnight cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Pending Attachments List */}
      {pendingAttachments.length > 0 && (
        <div className="px-4 py-2 bg-gold/10 border-b border-gold/20 flex items-center gap-2 overflow-x-auto">
          {pendingAttachments.map((att, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1.5 bg-white border border-gold/30 rounded-lg px-2.5 py-1 text-xs text-midnight shrink-0 shadow-xs"
            >
              <FileText className="h-3.5 w-3.5 text-gold-deep" />
              <span className="max-w-30 truncate">{att.fileName}</span>
              <button
                type="button"
                onClick={() => removeAttachment(idx)}
                className="text-muted hover:text-rose-600 ml-1 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {uploadError && (
        <div className="px-4 py-1.5 bg-rose-50 border-b border-rose-200 text-rose-700 text-xs flex items-center justify-between">
          <span>{uploadError}</span>
          <button type="button" onClick={() => setUploadError(null)}>
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Main Composer Controls */}
      <form onSubmit={handleSubmit} className="p-3 flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || disabled}
          className="p-2.5 rounded-xl border border-gold/30 bg-parchment/40 text-muted hover:text-midnight hover:border-gold transition-colors shrink-0 cursor-pointer disabled:opacity-50"
          title="Attach image or document (Max 10MB)"
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-gold-deep" />
          ) : (
            <Paperclip className="h-4 w-4" />
          )}
        </button>

        <button
          type="button"
          onClick={() => insertEmoji("🙏")}
          className="p-2.5 rounded-xl border border-gold/30 bg-parchment/40 text-muted hover:text-midnight hover:border-gold transition-colors shrink-0 hidden sm:block cursor-pointer"
          title="Insert Namaste"
        >
          <Smile className="h-4 w-4" />
        </button>

        {onSharePaymentQR && (
          <button
            type="button"
            onClick={onSharePaymentQR}
            disabled={disabled}
            className="p-2.5 rounded-xl border border-gold/30 bg-gold/15 text-gold-deep hover:bg-gold/25 hover:border-gold transition-colors shrink-0 cursor-pointer"
            title="Share Payment QR with Seeker"
          >
            <QrCode className="h-4 w-4" />
          </button>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder={
            editingMessage
              ? "Edit your message… (Press Enter to save)"
              : "Type your consultation message… (Shift+Enter for new line)"
          }
          className="flex-1 max-h-32 min-h-10.5 py-2.5 px-3.5 rounded-xl border border-gold/30 text-xs text-midnight placeholder:text-muted focus:outline-none focus:border-gold resize-none bg-parchment/15 leading-relaxed"
        />

        <button
          type="submit"
          disabled={isSending || disabled || (!text.trim() && pendingAttachments.length === 0)}
          className="p-2.5 rounded-xl bg-linear-to-r from-gold to-gold-deep hover:from-gold-deep hover:to-amber-700 text-midnight font-bold shadow-md hover:shadow-lg transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          title="Send message"
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </form>
    </div>
  );
});
