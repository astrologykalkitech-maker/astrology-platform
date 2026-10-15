// =====================================================
// AUTHENTICATION TYPES
// =====================================================

import type { UserRole, SignUpRole } from "./database.types";

export interface SignUpInput {
  email: string;
  password: string;
  full_name: string;
  role: SignUpRole;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface AuthSuccess<T = void> {
  success: true;
  data: T;
  error?: never;
}

export interface AuthFailure {
  success: false;
  error: string;
  data?: never;
  code?: string;
  status?: number;
  details?: Record<string, unknown>;
  requiresEmailConfirmation?: boolean;
}

export type AuthResult<T = void> = AuthSuccess<T> | AuthFailure;

export interface SignUpResponseData {
  userId: string;
  email: string;
  role: SignUpRole;
  requiresConfirmation: boolean;
}

export interface SignInResponseData {
  userId: string;
  email: string;
  role: UserRole;
  full_name: string | null;
}

export interface ActiveUserProfile {
  userId: string;
  email: string | null;
  role: UserRole;
  full_name: string | null;
  created_at: string;
}

