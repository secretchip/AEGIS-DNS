"use client";

/** Browser-side JSON fetch helper with consistent error surfacing. */
export async function apiFetch<T = unknown>(
  url: string,
  options?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, headers, ...rest } = options ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = (data as { error?: string }).error ?? `http_${res.status}`;
    throw new ApiError(code, res.status, data);
  }
  return data as T;
}

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public data: unknown,
  ) {
    super(code);
  }
}

export const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Incorrect email or password.",
  sso_required: "This account signs in via SSO.",
  email_taken: "That email is already in use.",
  slug_taken: "That slug is already taken.",
  last_owner: "You can't remove the last active owner.",
  cannot_modify_self: "You can't perform this action on your own account.",
  invalid_domain: "Enter a valid domain (e.g. example.com or *.example.com).",
  duplicate_rule: "That rule already exists.",
  account_suspended: "This account is suspended.",
  forbidden: "You don't have permission to do that.",
};

export function errorText(code: string): string {
  return ERROR_MESSAGES[code] ?? "Something went wrong. Please try again.";
}
