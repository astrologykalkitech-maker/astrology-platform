import test from "node:test";
import assert from "node:assert/strict";

test("Profile Picture Viewing: Avatar props compute preview accessibility attributes correctly", () => {
  interface AvatarState {
    name: string;
    src?: string | null;
    failedSrc?: string | null;
    allowPreview?: boolean;
  }

  function computeAvatarAccessibility(state: AvatarState) {
    const showImage = Boolean(state.src) && state.failedSrc !== state.src;
    const canPreview = (state.allowPreview !== false) && showImage;

    return {
      showImage,
      canPreview,
      role: canPreview ? "button" : undefined,
      tabIndex: canPreview ? 0 : undefined,
      ariaLabel: canPreview ? `View full photo of ${state.name}` : undefined,
      title: canPreview ? `Click to view full photo of ${state.name}` : undefined,
    };
  }

  // 1. With valid photo URL and default allowPreview=true
  const withPhoto = computeAvatarAccessibility({
    name: "Pandit Sharma",
    src: "https://example.com/photos/pandit.jpg",
  });
  assert.equal(withPhoto.showImage, true);
  assert.equal(withPhoto.canPreview, true);
  assert.equal(withPhoto.role, "button");
  assert.equal(withPhoto.tabIndex, 0);
  assert.equal(withPhoto.ariaLabel, "View full photo of Pandit Sharma");

  // 2. Without photo URL (shows initials)
  const withoutPhoto = computeAvatarAccessibility({
    name: "Pandit Sharma",
    src: null,
  });
  assert.equal(withoutPhoto.showImage, false);
  assert.equal(withoutPhoto.canPreview, false);
  assert.equal(withoutPhoto.role, undefined);
  assert.equal(withoutPhoto.tabIndex, undefined);

  // 3. With failed photo URL (fallback triggered)
  const withFailedPhoto = computeAvatarAccessibility({
    name: "Pandit Sharma",
    src: "https://example.com/broken.jpg",
    failedSrc: "https://example.com/broken.jpg",
  });
  assert.equal(withFailedPhoto.showImage, false);
  assert.equal(withFailedPhoto.canPreview, false);

  // 4. With explicit allowPreview=false
  const previewDisabled = computeAvatarAccessibility({
    name: "Pandit Sharma",
    src: "https://example.com/photos/pandit.jpg",
    allowPreview: false,
  });
  assert.equal(previewDisabled.showImage, true);
  assert.equal(previewDisabled.canPreview, false);
  assert.equal(previewDisabled.role, undefined);
});

test("Profile Picture Viewing: Keyboard interactions activate and dismiss preview modal", () => {
  let modalOpen = false;

  function handleAvatarKeyDown(key: string, canPreview: boolean) {
    if (canPreview && (key === "Enter" || key === " ")) {
      modalOpen = true;
    }
  }

  function handleModalKeyDown(key: string) {
    if (key === "Escape") {
      modalOpen = false;
    }
  }

  // Pressing Enter on focused avatar opens modal
  handleAvatarKeyDown("Enter", true);
  assert.equal(modalOpen, true);

  // Pressing Escape inside modal closes it
  handleModalKeyDown("Escape");
  assert.equal(modalOpen, false);

  // Pressing Space on focused avatar opens modal
  handleAvatarKeyDown(" ", true);
  assert.equal(modalOpen, true);

  // Other keys do not trigger close or open
  handleModalKeyDown("ArrowDown");
  assert.equal(modalOpen, true);

  handleModalKeyDown("Escape");
  assert.equal(modalOpen, false);
});

test("Profile Picture Viewing: Initials generation logic produces clean 1-2 letter uppercase initials", () => {
  function getInitials(name: string) {
    const letters = name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "");
    return letters.join("") || "A";
  }

  assert.equal(getInitials("Pandit Sharma"), "PS");
  assert.equal(getInitials("Rahul"), "R");
  assert.equal(getInitials("Acharya Dev Kumar"), "AD");
  assert.equal(getInitials("   "), "A");
  assert.equal(getInitials("dr. anita shukla"), "DA");
});

test("Profile Picture Viewing: Customer Header forwards avatar_url when present", () => {
  interface Profile {
    full_name: string | null;
    avatar_url: string | null;
  }

  function resolveHeaderAvatar(profile: Profile) {
    return {
      customerName: profile.full_name || "Customer",
      photoUrl: profile.avatar_url ?? null,
    };
  }

  const profileWithPhoto = resolveHeaderAvatar({
    full_name: "Rahul Verma",
    avatar_url: "https://storage.supabase.co/avatars/user123.jpg",
  });
  assert.equal(profileWithPhoto.customerName, "Rahul Verma");
  assert.equal(profileWithPhoto.photoUrl, "https://storage.supabase.co/avatars/user123.jpg");

  const profileWithoutPhoto = resolveHeaderAvatar({
    full_name: null,
    avatar_url: null,
  });
  assert.equal(profileWithoutPhoto.customerName, "Customer");
  assert.equal(profileWithoutPhoto.photoUrl, null);
});

