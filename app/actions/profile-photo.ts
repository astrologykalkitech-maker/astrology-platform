"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AuthResult } from "@/lib/types/auth.types";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

/**
 * Validate magic bytes to prevent disguised executable or malicious file uploads.
 */
function detectImageType(buffer: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;

  // WebP: RIFF .... WEBP
  const isWebp =
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50; // P

  if (isJpeg) return "image/jpeg";
  if (isPng) return "image/png";
  if (isWebp) return "image/webp";
  return null;
}

/**
 * Upload profile photo for authenticated customer or astrologer.
 */
export async function uploadProfilePhotoAction(
  formData: FormData
): Promise<AuthResult<{ photoUrl: string }>> {
  try {
    const { user, profile } = await requireAuth();

    const file = formData.get("photo") as File | null;
    if (!file) {
      return { success: false, error: "No photo file provided." };
    }

    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: "Photo exceeds maximum limit of 5 MB." };
    }

    if (!ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
      return {
        success: false,
        error: "Invalid file format. Allowed formats are JPEG, PNG, and WebP.",
      };
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Trust the file's actual bytes, never the client-declared type, for the stored type/extension
    const detectedType = detectImageType(buffer);
    if (!detectedType) {
      return {
        success: false,
        error: "File content validation failed. The uploaded file is not a valid image.",
      };
    }

    const admin = await createAdminClient("main");
    const ext = detectedType === "image/png" ? "png" : detectedType === "image/webp" ? "webp" : "jpg";
    const fileName = `${user.id}-${Date.now()}.${ext}`;
    const storagePath = `avatars/${fileName}`;

    let publicUrl: string;

    try {
      // 1. Ensure storage bucket exists
      const { data: buckets } = await admin.storage.listBuckets();
      const hasBucket = buckets?.some((b) => b.name === "avatars");
      if (!hasBucket) {
        await admin.storage.createBucket("avatars", {
          public: true,
          fileSizeLimit: MAX_FILE_SIZE,
          allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
        });
      }

      // 2. Upload file to Supabase storage
      const { error: uploadError } = await admin.storage
        .from("avatars")
        .upload(storagePath, buffer, {
          contentType: detectedType,
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: urlData } = admin.storage.from("avatars").getPublicUrl(storagePath);
      publicUrl = urlData.publicUrl;
    } catch (storageErr) {
      console.error("[uploadProfilePhotoAction] storage upload failed:", storageErr);
      // Embedding up to 5 MB of base64 in database rows is only tolerated outside production
      // (e.g. local development without Storage). In production fail with a clear error.
      if (process.env.NODE_ENV === "production") {
        return {
          success: false,
          error: "Photo storage is temporarily unavailable. Please try again later.",
        };
      }
      publicUrl = `data:${detectedType};base64,${buffer.toString("base64")}`;
    }

    // 3. Persist photo URL in profiles (report failures instead of false success)
    const { error: profileUpdateErr } = await admin
      .from("profiles")
      .update({
        avatar_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (profileUpdateErr) {
      console.error("[uploadProfilePhotoAction] profile update failed:", profileUpdateErr.message);
      return { success: false, error: "Failed to save your photo. Please try again." };
    }

    // 4. If user is an astrologer, also update astrologer_profiles
    if (profile.role === "astrologer") {
      const { error: astroUpdateErr } = await admin
        .from("astrologer_profiles")
        .update({
          profile_photo_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (astroUpdateErr) {
        console.error("[uploadProfilePhotoAction] astrologer photo update failed:", astroUpdateErr.message);
        return { success: false, error: "Failed to save your photo. Please try again." };
      }
    }

    revalidatePath("/customer/profile");
    revalidatePath("/astrologer/profile");
    revalidatePath("/astrologer/profile/edit");

    return {
      success: true,
      data: { photoUrl: publicUrl },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to upload photo.";
    return { success: false, error: message };
  }
}

/**
 * Remove profile photo and revert to initials avatar.
 */
export async function removeProfilePhotoAction(): Promise<AuthResult<boolean>> {
  try {
    const { user, profile } = await requireAuth();
    const admin = await createAdminClient("main");

    await admin
      .from("profiles")
      .update({
        avatar_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (profile.role === "astrologer") {
      await admin
        .from("astrologer_profiles")
        .update({
          profile_photo_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
    }

    revalidatePath("/customer/profile");
    revalidatePath("/astrologer/profile");
    revalidatePath("/astrologer/profile/edit");

    return { success: true, data: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to remove photo.";
    return { success: false, error: message };
  }
}

