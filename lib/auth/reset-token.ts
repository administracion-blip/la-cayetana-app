import { createHash, randomBytes } from "node:crypto";

/** Token en claro enviado por email (64 hex). */
export function generateRawResetToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashResetToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function passwordResetItemId(tokenHashHex: string): string {
  return `PWD_RESET#${tokenHashHex}`;
}
