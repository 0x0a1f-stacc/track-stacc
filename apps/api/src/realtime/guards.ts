import { AppError } from "../lib/errors.js";

const LISTENER_READ_ONLY_MESSAGE = "Join with a protected nickname to do that.";

export interface WsGuardContext {
  accessTier?: string | null;
}

export function requireMemberWs(context: WsGuardContext): void {
  if (context.accessTier !== "member") {
    throw new AppError("LISTENER_READ_ONLY", LISTENER_READ_ONLY_MESSAGE, 403);
  }
}
