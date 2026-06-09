import {
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { AppError } from "./errors.js";

const DEFAULT_SECRET = "development_secret_change_me_min_32_chars";
let secret: string = DEFAULT_SECRET;

export function setSecret(s: string): void {
  secret = s;
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export interface WsTokenPayload {
  roomId: string;
  sessionId: string;
  accessTier?: string;
  exp: number;
}

export function signWsToken(
  payload: Omit<WsTokenPayload, "exp">,
  ttlSeconds = 60 * 60,
) {
  const fullPayload: WsTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

export function verifyWsToken(token: string): WsTokenPayload {
  const [body, signature] = token.split(".");
  if (!body || !signature)
    throw new AppError("WEBSOCKET_TOKEN_INVALID", "Invalid websocket token.", 401);
  const expected = createHmac("sha256", secret)
    .update(body)
    .digest("base64url");
  if (
    Buffer.from(signature).length !== Buffer.from(expected).length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    throw new AppError("WEBSOCKET_TOKEN_INVALID", "Invalid websocket token.", 401);
  const parsed = JSON.parse(
    Buffer.from(body, "base64url").toString("utf8"),
  ) as WsTokenPayload;
  if (parsed.exp < Math.floor(Date.now() / 1000))
    throw new AppError("WEBSOCKET_TOKEN_INVALID", "Websocket token expired.", 401);
  return parsed;
}
