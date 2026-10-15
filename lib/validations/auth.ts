// =====================================================
// AUTHENTICATION INPUT VALIDATION
// =====================================================

import type { SignUpInput, SignInInput } from "@/lib/types/auth.types";
import type { SignUpRole } from "@/lib/types/database.types";

export type ValidationResult<T> =
  | { valid: true; data: T; error?: never }
  | { valid: false; error: string; data?: never };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignUpInput(raw: unknown): ValidationResult<SignUpInput> {
  if (typeof raw !== "object" || raw === null) {
    return { valid: false, error: "Invalid form payload." };
  }

  const { email, password, full_name, role } = raw as Record<string, unknown>;

  // 1. Email validation
  if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
    return { valid: false, error: "Please enter a valid email address." };
  }

  // 2. Password validation
  if (typeof password !== "string" || password.length < 6) {
    return {
      valid: false,
      error: "Password must be at least 6 characters long.",
    };
  }

  // 3. Full name validation
  if (typeof full_name !== "string" || full_name.trim().length < 2) {
    return {
      valid: false,
      error: "Full name must be at least 2 characters long.",
    };
  }

  // 4. Role validation & security guard against 'admin'
  if (role === "admin") {
    return {
      valid: false,
      error: "Self-assignment of the admin role is prohibited.",
    };
  }

  if (role !== "customer" && role !== "astrologer") {
    return {
      valid: false,
      error: "Invalid role selected. Role must be 'customer' or 'astrologer'.",
    };
  }

  return {
    valid: true,
    data: {
      email: email.trim().toLowerCase(),
      password,
      full_name: full_name.trim(),
      role: role as SignUpRole,
    },
  };
}

export function validateSignInInput(raw: unknown): ValidationResult<SignInInput> {
  if (typeof raw !== "object" || raw === null) {
    return { valid: false, error: "Invalid form payload." };
  }

  const { email, password } = raw as Record<string, unknown>;

  if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
    return { valid: false, error: "Please enter a valid email address." };
  }

  if (typeof password !== "string" || password.length === 0) {
    return { valid: false, error: "Password is required." };
  }

  return {
    valid: true,
    data: {
      email: email.trim().toLowerCase(),
      password,
    },
  };
}
