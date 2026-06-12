import { AccessTier } from "@trackstacc/types";

export interface RoomCredentials {
  token: string;
  tier: AccessTier;
  listenerSessionId: string | null;
  source: "session" | "local";
}

const tokenKey = (slug: string) => `ws:${slug}`;
const tierKey = (slug: string) => `ws:${slug}:tier`;
const listenerSessionKey = (slug: string) => `ws:${slug}:listenerSessionId`;

/**
 * Reads token and access tier from a consistent source order (sessionStorage, then localStorage).
 * Ensures both token and tier exist in the same source.
 */
export function getRoomCredentials(roomSlug: string): RoomCredentials | null {
  if (typeof window === "undefined") return null;

  // 1. Try sessionStorage
  const sessionToken = sessionStorage.getItem(tokenKey(roomSlug));
  const sessionTier = sessionStorage.getItem(tierKey(roomSlug));
  const sessionListenerId = sessionStorage.getItem(listenerSessionKey(roomSlug));

  if (sessionToken && (sessionTier === "listener" || sessionTier === "member")) {
    return {
      token: sessionToken,
      tier: sessionTier as AccessTier,
      listenerSessionId: sessionListenerId,
      source: "session",
    };
  }

  // 2. Try localStorage
  const localToken = localStorage.getItem(tokenKey(roomSlug));
  const localTier = localStorage.getItem(tierKey(roomSlug));
  const localListenerId = localStorage.getItem(listenerSessionKey(roomSlug));

  if (localToken && (localTier === "listener" || localTier === "member")) {
    return {
      token: localToken,
      tier: localTier as AccessTier,
      listenerSessionId: localListenerId,
      source: "local",
    };
  }

  return null;
}

/**
 * Persists authenticated member credentials to both sessionStorage and localStorage,
 * and clears any stale listener sessions.
 */
export function persistMemberCredentials(
  roomSlug: string,
  token: string,
  tier: string,
): void {
  if (typeof window === "undefined") return;

  const tKey = tokenKey(roomSlug);
  const trKey = tierKey(roomSlug);
  const lKey = listenerSessionKey(roomSlug);

  // Write to sessionStorage
  sessionStorage.setItem(tKey, token);
  sessionStorage.setItem(trKey, tier);
  sessionStorage.removeItem(lKey);

  // Write to localStorage
  localStorage.setItem(tKey, token);
  localStorage.setItem(trKey, tier);
  localStorage.removeItem(lKey);
}

/**
 * Persists listener credentials to sessionStorage only.
 */
export function persistListenerCredentials(
  roomSlug: string,
  token: string,
  tier: string,
  listenerSessionId: string,
): void {
  if (typeof window === "undefined") return;

  const tKey = tokenKey(roomSlug);
  const trKey = tierKey(roomSlug);
  const lKey = listenerSessionKey(roomSlug);

  // Write to sessionStorage only (listeners are ephemeral)
  sessionStorage.setItem(tKey, token);
  sessionStorage.setItem(trKey, tier);
  sessionStorage.setItem(lKey, listenerSessionId);
}

/**
 * Clears room credentials from both sessionStorage and localStorage.
 */
export function clearRoomCredentials(roomSlug: string): void {
  if (typeof window === "undefined") return;

  const tKey = tokenKey(roomSlug);
  const trKey = tierKey(roomSlug);
  const lKey = listenerSessionKey(roomSlug);

  sessionStorage.removeItem(tKey);
  sessionStorage.removeItem(trKey);
  sessionStorage.removeItem(lKey);

  localStorage.removeItem(tKey);
  localStorage.removeItem(trKey);
  localStorage.removeItem(lKey);
}
