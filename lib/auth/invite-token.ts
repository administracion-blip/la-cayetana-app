import { createHash, randomBytes } from "node:crypto";

/** Token en claro enviado por email (64 hex). */
export function generateRawInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashInviteToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function memberInviteItemId(tokenHashHex: string): string {
  return `INVITE#${tokenHashHex}`;
}
