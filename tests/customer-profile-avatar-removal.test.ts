import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 2.11: Avatar Removal & Fallback Initials Display", () => {
  const profilePhotoActionPath = path.resolve(process.cwd(), "app/actions/profile-photo.ts");
  const uploaderPath = path.resolve(process.cwd(), "components/profile/ProfilePhotoUploader.tsx");

  const actionContent = fs.readFileSync(profilePhotoActionPath, "utf-8");
  const uploaderContent = fs.readFileSync(uploaderPath, "utf-8");

  it("handles photo removal and sets avatar_url to null in removeProfilePhotoAction", () => {
    assert.match(
      actionContent,
      /export async function removeProfilePhotoAction\(\)[\s\S]*?\.from\("profiles"\)[\s\S]*?\.update\(\{[\s\S]*?avatar_url:\s*null,[\s\S]*?\}\)[\s\S]*?\.eq\("id",\s*user\.id\)/,
      "removeProfilePhotoAction must set avatar_url to null for user.id"
    );
  });

  it("revalidates customer and astrologer profile paths upon photo removal", () => {
    assert.match(
      actionContent,
      /revalidatePath\("\/customer\/profile"\);/,
      "Must revalidate /customer/profile on removal"
    );
  });

  it("ProfilePhotoUploader generates up to 2 uppercase initials as fallback", () => {
    assert.match(
      uploaderContent,
      /const initials = \(name \|\| "U"\)[\s\S]*?\.split\(" "\)[\s\S]*?\.filter\(Boolean\)[\s\S]*?\.slice\(0, 2\)[\s\S]*?\.map\(\(p\) => p\[0\]\.toUpperCase\(\)\)[\s\S]*?\.join\(""\);/,
      "Must compute 2-character uppercase initials"
    );
    assert.match(
      uploaderContent,
      /<span>\{initials \|\| "U"\}<\/span>/,
      "Must render initials span when photoUrl is null"
    );
  });

  it("renders Remove button with Trash2 icon when photoUrl exists", () => {
    assert.match(
      uploaderContent,
      /<Trash2 className="h-3 w-3" \/>\s*Remove/,
      "Must render Trash2 icon with Remove button"
    );
  });
});
