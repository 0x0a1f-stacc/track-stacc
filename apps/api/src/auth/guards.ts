import { AppError } from "../lib/errors.js";

const LISTENER_READ_ONLY_MESSAGE = "Join with a protected nickname to do that.";
const AUTH_REQUIRED_MESSAGE = "Join the room before doing that.";
const HOST_REQUIRED_MESSAGE = "Only the host can do that.";
const MODERATOR_REQUIRED_MESSAGE = "Only a host or moderator can do that.";

export interface SessionGuard {
  id: string;
  accessTier: string;
  role: string;
}

export function createListenerReadOnlyError(): AppError {
  return new AppError("LISTENER_READ_ONLY", LISTENER_READ_ONLY_MESSAGE, 403);
}

export function requireMember(session: SessionGuard | undefined): SessionGuard {
  if (!session) {
    throw new AppError("AUTH_REQUIRED", AUTH_REQUIRED_MESSAGE, 401);
  }
  if (session.accessTier !== "member") {
    throw createListenerReadOnlyError();
  }
  return session;
}

export function requireHost(session: SessionGuard | undefined): SessionGuard {
  const member = requireMember(session);
  if (member.role !== "host") {
    throw new AppError("HOST_REQUIRED", HOST_REQUIRED_MESSAGE, 403);
  }
  return member;
}

export function requireModerator(
  session: SessionGuard | undefined,
): SessionGuard {
  const member = requireMember(session);
  if (member.role !== "host" && member.role !== "moderator") {
    throw new AppError("MODERATOR_REQUIRED", MODERATOR_REQUIRED_MESSAGE, 403);
  }
  return member;
}
