"use client";

import React, { useState, useRef } from "react";
import Image from "next/image";
import { Camera, Trash2, Loader2, Upload, AlertCircle } from "lucide-react";
import { uploadProfilePhotoAction, removeProfilePhotoAction } from "@/app/actions/profile-photo";

interface Props {
  initialPhotoUrl?: string | null;
  name: string;
  onPhotoUpdated?: (url: string | null) => void;
  size?: "sm" | "md" | "lg";
}

export function ProfilePhotoUploader({
  initialPhotoUrl,
  name,
  onPhotoUpdated,
  size = "md",
}: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialPhotoUrl || null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initials = (name || "U")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("Photo must be less than 5 MB.");
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("photo", file);

    const res = await uploadProfilePhotoAction(formData);
    setUploading(false);

    if (res.success && res.data) {
      setPhotoUrl(res.data.photoUrl);
      onPhotoUpdated?.(res.data.photoUrl);
    } else {
      setError(res.error || "Failed to upload photo.");
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setUploading(true);
    setError(null);

    const res = await removeProfilePhotoAction();
    setUploading(false);

    if (res.success) {
      setPhotoUrl(null);
      onPhotoUpdated?.(null);
    } else {
      setError(res.error || "Failed to remove photo.");
    }
  }

  const dimClass =
    size === "sm"
      ? "h-14 w-14 text-base"
      : size === "lg"
      ? "h-24 w-24 text-2xl"
      : "h-16 w-16 sm:h-20 sm:w-20 text-lg sm:text-xl";

  return (
    <div className="flex flex-col items-center sm:items-start gap-2.5">
      <div className="relative group shrink-0">
        <div
          className={`relative ${dimClass} rounded-full overflow-hidden border-2 border-gold/40 bg-gradient-to-br from-champagne/40 to-parchment shadow-md flex items-center justify-center font-display font-bold text-midnight`}
        >
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt={name || "Profile Photo"}
              fill
              sizes="96px"
              className="object-cover"
            />
          ) : (
            <span>{initials || "U"}</span>
          )}

          {uploading && (
            <div className="absolute inset-0 bg-midnight/70 flex items-center justify-center text-champagne z-10 backdrop-blur-xs">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
        </div>

        {/* Change badge */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          aria-label="Upload new photo"
          className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-midnight text-champagne border border-gold/40 shadow hover:bg-plum transition-transform active:scale-95"
        >
          <Camera className="h-4 w-4" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Action controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-gold-deep hover:text-midnight transition-colors"
        >
          <Upload className="h-3 w-3" />
          {photoUrl ? "Change Photo" : "Upload Photo"}
        </button>

        {photoUrl && (
          <>
            <span className="text-muted text-[10px]">•</span>
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-800 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Remove
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-[11px] text-red-600 font-medium">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

