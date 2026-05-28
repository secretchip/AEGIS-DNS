import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { Client } from "@/db/schema";
import { can, type Capability } from "@/lib/permissions";
import {
  ForbiddenError,
  SuspendedError,
  UnauthorizedError,
  type CurrentUser,
} from "@/lib/session";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function apiError(code: string, status: number, detail?: unknown) {
  return NextResponse.json({ error: code, detail }, { status });
}

/** Wrap a route handler so thrown auth/validation errors map to JSON codes. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof UnauthorizedError) return apiError("unauthorized", 401);
    if (err instanceof SuspendedError) return apiError("account_suspended", 403);
    if (err instanceof ForbiddenError) return apiError("forbidden", 403);
    if (err instanceof ZodError) {
      return apiError("invalid_request", 400, err.flatten());
    }
    if (err instanceof HttpError) return apiError(err.code, err.status, err.detail);
    console.error("Unhandled API error:", err);
    return apiError("internal_error", 500);
  }
}

export class HttpError extends Error {
  constructor(
    public code: string,
    public status: number,
    public detail?: unknown,
  ) {
    super(code);
  }
}

/** Enforce that the caller's client role has a capability. */
export function assertCan(current: CurrentUser, cap: Capability): void {
  if (current.user.platformRole !== "client" || !can(current.user.clientRole, cap)) {
    throw new ForbiddenError();
  }
}

/** Block client mutations while the tenant is suspended. */
export function assertActiveClient(client: Client | null): void {
  if (client && client.status === "disabled") throw new SuspendedError();
}
