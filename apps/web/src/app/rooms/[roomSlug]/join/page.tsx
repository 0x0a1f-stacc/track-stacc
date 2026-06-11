"use client";

import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { AccessTier } from "@trackstacc/types";
import { Button, Input } from "@trackstacc/ui";
import { api } from "@/lib/api";
import { useRoomStore } from "@/stores/room.store";

const listenerSessionKey = (slug: string) => `ws:${slug}:listenerSessionId`;
const MIN_PASSWORD_LENGTH = 10;

function parseErrorCode(caught: unknown): string | null {
  if (!(caught instanceof Error)) return null;
  try {
    const body = JSON.parse(caught.message) as { error?: { code?: string } };
    return body.error?.code ?? null;
  } catch {
    return null;
  }
}

function errorMessageFromCode(code: string): string {
  switch (code) {
    case "NICKNAME_TAKEN":
      return "That nickname is already taken.";
    case "NICKNAME_PROTECTED":
      return "That nickname is protected. Enter its password to use it.";
    case "NICKNAME_PASSWORD_INCORRECT":
      return "The password was incorrect.";
    case "NICKNAME_PASSWORD_RATE_LIMITED":
      return "Too many incorrect attempts. Try again later.";
    case "VALIDATION_FAILED":
      return "Some fields are missing or invalid.";
    case "SESSION_INVALID":
      return "Your room session expired. Please rejoin.";
    case "SERVICE_DEGRADED":
      return "Nickname authentication is temporarily unavailable. Try again shortly.";
    default:
      return "Something went wrong. Try again.";
  }
}

export default function JoinPage() {
  const { roomSlug } = useParams<{ roomSlug: string }>();
  const router = useRouter();
  const setToken = useRoomStore((state) => state.setToken);
  const setOwnAccessTier = useRoomStore((state) => state.setOwnAccessTier);
  const setListenerSessionId = useRoomStore(
    (state) => state.setListenerSessionId,
  );
  const [displayNickname, setNickname] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  // Read listenerSessionId from sessionStorage (set by RoomShell on /listen)
  const listenerSessionId =
    typeof window !== "undefined"
      ? sessionStorage.getItem(listenerSessionKey(roomSlug))
      : null;

  async function join(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldError(null);

    // Client-side validation
    if (!displayNickname.trim()) {
      setFieldError("Nickname is required.");
      return;
    }
    if (!password) {
      setFieldError("Password is required.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setFieldError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
      return;
    }
    if (password !== confirm) {
      setFieldError("Passwords do not match.");
      return;
    }

    try {
      const response = await api.joinRoom(roomSlug, {
        displayNickname: displayNickname.trim(),
        nicknamePassword: password,
        ...(listenerSessionId ? { listenerSessionId } : {}),
      });
      setToken(response.websocketToken);
      setOwnAccessTier(response.session.accessTier as AccessTier);
      setListenerSessionId(null);
      sessionStorage.removeItem(listenerSessionKey(roomSlug));
      sessionStorage.setItem(`ws:${roomSlug}`, response.websocketToken);
      sessionStorage.setItem(
        `ws:${roomSlug}:tier`,
        response.session.accessTier,
      );
      localStorage.setItem(`ws:${roomSlug}`, response.websocketToken);
      router.push(`/rooms/${roomSlug}`);
    } catch (caught) {
      const code = parseErrorCode(caught);
      if (code === "NICKNAME_PROTECTED") {
        setError(
          "That nickname is protected. Make sure you entered the correct password.",
        );
      } else {
        setError(code ? errorMessageFromCode(code) : "Join failed. Try again.");
      }
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-lg place-items-center px-6">
      <form
        onSubmit={(event) => {
          join(event).catch(console.error);
        }}
        className="w-full rounded-3xl border border-white/10 bg-zinc-950/85 p-8"
      >
        <h1 className="text-3xl font-black">Choose your nickname</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Protected nicknames cannot be recovered if you forget the password.
        </p>
        <div className="mt-6 space-y-4">
          <Input
            label="Nickname"
            value={displayNickname}
            onChange={(event) => {
              setNickname(event.target.value);
              setFieldError(null);
              setError(null);
            }}
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setFieldError(null);
              setError(null);
            }}
            required
          />
          <Input
            label="Confirm password"
            type="password"
            value={confirm}
            onChange={(event) => {
              setConfirm(event.target.value);
              setFieldError(null);
              setError(null);
            }}
            required
          />
          {fieldError ? (
            <p className="text-sm text-red-300">{fieldError}</p>
          ) : null}
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <Button className="w-full">Join room</Button>
        </div>
      </form>
    </main>
  );
}
