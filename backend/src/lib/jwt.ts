import jwt, { type SignOptions } from "jsonwebtoken";
import type { User } from "@prisma/client";
import { env } from "../config/env.js";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: string;
}

export function signAccessToken(user: Pick<User, "id" | "email" | "role">) {
  const payload: AuthTokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
  };

  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };

  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
}
