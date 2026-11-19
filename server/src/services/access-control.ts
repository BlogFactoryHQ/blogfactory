import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

export type UserRole = "admin" | "user";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.trim().toLowerCase());
}

export function isApproved(role?: string | null, status?: string | null): boolean {
  return role === "admin" || status === "approved";
}

export const SUSPENDED_ALLOWED_PATHS: ReadonlySet<string> = new Set(["/api/auth/me", "/api/auth/workos/logout"]);

export function isSuspended(user: { role?: string | null; suspendedAt?: Date | string | null }): boolean {
  return Boolean(user.suspendedAt) && user.role !== "admin";
}

export function publicUser<T extends {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified?: boolean;
  role?: string;
  approvalStatus?: string;
  rejectedReason?: string | null;
  suspendedAt?: Date | string | null;
  createdAt?: Date | string;
}>(user: T) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
    role: user.role || "user",
    approvalStatus: user.approvalStatus || "pending",
    rejectedReason: user.rejectedReason || null,
    // The suspension reason is an internal admin note and is never sent to the customer.
    suspendedAt: isSuspended(user) ? user.suspendedAt : null,
    createdAt: user.createdAt,
  };
}

export async function bootstrapUserAccess<T extends {
  id: string;
  email: string;
  role?: string;
  approvalStatus?: string;
}>(user: T): Promise<T> {
  if (!isAdminEmail(user.email)) return user;
  if (user.role === "admin" && user.approvalStatus === "approved") return user;

  await db
    .update(users)
    .set({
      role: "admin",
      approvalStatus: "approved",
      approvedAt: new Date(),
      rejectedAt: null,
      rejectedReason: null,
    })
    .where(eq(users.id, user.id));

  return {
    ...user,
    role: "admin",
    approvalStatus: "approved",
  };
}
