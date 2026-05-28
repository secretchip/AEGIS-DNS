/**
 * Symmetric encryption for per-client auth-config secrets at rest
 * (e.g. OIDC client secrets). Uses AES-256-GCM with a key derived from
 * CONFIG_ENCRYPTION_KEY. Values are stored as "v1:<iv>:<tag>:<ciphertext>"
 * (all base64).
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const PREFIX = "v1";

function key(): Buffer {
  const secret = process.env.CONFIG_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error(
      "CONFIG_ENCRYPTION_KEY must be set and at least 32 characters long.",
    );
  }
  // Normalize any-length secret to a 32-byte key.
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    enc.toString("base64"),
  ].join(":");
}

export function decryptSecret(stored: string): string {
  const [prefix, ivB64, tagB64, dataB64] = stored.split(":");
  if (prefix !== PREFIX) {
    throw new Error("Unsupported secret format.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** True if a value looks like it was produced by encryptSecret. */
export function isEncrypted(value: string | undefined | null): boolean {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}
