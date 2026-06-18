import bcrypt from "bcryptjs";
import crypto from "crypto";

const hashValue = (value: string, saltRounds = 12) =>
  bcrypt.hash(value, saltRounds);

const compareHash = (value: string, hash: string) =>
  bcrypt.compare(value, hash);

const hashEmail = (email: string | null) => {
  if (!email) {
    return null;
  }

  return crypto
    .createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
};

export const hashService = { compareHash, hashValue, hashEmail };

export type HashService = typeof hashService;
