import { createHash } from "node:crypto";

/** A stable opaque directory name, derived exclusively from a verified principal. */
export function personalStorageNamespace(issuer: string, subject: string): string {
  if (!issuer || !subject) throw new TypeError("A verified issuer and subject are required for hosted recipe storage.");
  return createHash("sha256").update(issuer).update("\0").update(subject).digest("base64url");
}
