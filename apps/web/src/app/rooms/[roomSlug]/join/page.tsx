"use client";

import { AccessTier } from "@trackstacc/types";
import { Button, Input } from "@trackstacc/ui";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";

import { api } from "@/lib/api";
import { getRoomCredentials, persistMemberCredentials } from "@/lib/storage";
import { useRoomStore } from "@/stores/room.store";
const MIN_PASSWORD_LENGTH = 10;

type Mode = "auth" | "new";

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
  const [mode, setMode] = React.useState<Mode>("auth");
  const [displayNickname, setDisplayNickname] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [suggestion, setSuggestion] = React.useState<{
    message: string;
    targetMode: Mode;
  } | null>(null);

  // Read listenerSessionId from sessionStorage (set by RoomShell on /listen)
  const listenerSessionId =
    typeof window !== "undefined"
      ? (getRoomCredentials(roomSlug)?.listenerSessionId ?? null)
      : null;

  async function join(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuggestion(null);

    // Client-side validation
    if (!displayNickname.trim()) {
      setError("Nickname is required.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }
    if (mode === "new") {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(
          `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        );
        return;
      }
      if (password !== confirm) {
        setError("Passwords do not match.");
        return;
      }
    }

    setLoading(true);

    try {
      // Check nickname status before committing
      let protectedStatus: boolean | null = null;
      try {
        setChecking(true);
        const check = await api.checkNickname({
          displayNickname: displayNickname.trim(),
        });
        protectedStatus = check.protected;
        setChecking(false);
      } catch {
        setChecking(false);
      }

      if (mode === "auth" && protectedStatus === false) {
        setSuggestion({
          message:
            "No protected nickname found for this name. Would you like to create it instead?",
          targetMode: "new",
        });
        setLoading(false);
        return;
      }

      if (mode === "new" && protectedStatus === true) {
        setSuggestion({
          message:
            "That nickname is already protected. Would you like to sign in instead?",
          targetMode: "auth",
        });
        setLoading(false);
        return;
      }

      const response = await api.joinRoom(roomSlug, {
        displayNickname: displayNickname.trim(),
        nicknamePassword: password,
        ...(listenerSessionId ? { listenerSessionId } : {}),
      });
      setToken(response.websocketToken);
      setOwnAccessTier(response.session.accessTier as AccessTier);
      setListenerSessionId(null);
      persistMemberCredentials(
        roomSlug,
        response.websocketToken,
        response.session.accessTier,
      );
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
    } finally {
      setLoading(false);
    }
  }

  function switchToAuth() {
    setMode("auth");
    setPassword("");
    setConfirm("");
    setError(null);
    setSuggestion(null);
  }

  function switchToNew() {
    setMode("new");
    setPassword("");
    setConfirm("");
    setError(null);
    setSuggestion(null);
  }

  const labels = {
    auth: {
      title: "Sign in with your nickname",
      subtitle: "Use your protected nickname to participate.",
      submitLabel: "Sign in and join",
      toggle: "New here? Create a protected nickname",
      toggleAction: switchToNew,
    },
    new: {
      title: "Create a protected nickname",
      subtitle:
        "Pick a nickname and protect it with a password. No email required.",
      submitLabel: "Create nickname and join",
      toggle: "Already have one? Sign in",
      toggleAction: switchToAuth,
    },
  };

  const l = labels[mode];

  return (
    <main className="mx-auto grid min-h-screen max-w-lg place-items-center px-6">
      <form
        onSubmit={(event) => {
          join(event).catch(console.error);
        }}
        className="w-full rounded-3xl border border-white/10 bg-zinc-950/85 p-8"
      >
        <h1 className="text-3xl font-black">{l.title}</h1>
        <p className="mt-2 text-sm text-zinc-400">{l.subtitle}</p>
        {mode === "new" ? (
          <p className="mt-2 text-sm text-amber-300">
            No password recovery exists yet. If you forget this password, you
            cannot recover this nickname.
          </p>
        ) : null}
        <div className="mt-6 space-y-4">
          <Input
            label="Nickname"
            value={displayNickname}
            onChange={(event) => {
              setDisplayNickname(event.target.value);
              setError(null);
              setSuggestion(null);
            }}
            required
          />

          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
              setSuggestion(null);
            }}
            required
          />

          {mode === "new" ? (
            <Input
              label="Confirm password"
              type="password"
              value={confirm}
              onChange={(event) => {
                setConfirm(event.target.value);
                setError(null);
                setSuggestion(null);
              }}
              required
            />
          ) : null}

          {suggestion ? (
            <div className="space-y-2 rounded-xl border border-brand-500/30 bg-brand-500/10 p-3">
              <p className="text-sm text-brand-200">{suggestion.message}</p>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => {
                  if (suggestion.targetMode === "new") {
                    switchToNew();
                  } else {
                    switchToAuth();
                  }
                }}
              >
                {suggestion.targetMode === "new"
                  ? "Create a protected nickname"
                  : "Sign in instead"}
              </Button>
            </div>
          ) : error ? (
            <p className="text-sm text-red-300">{error}</p>
          ) : null}

          {!suggestion ? (
            <>
              <Button className="w-full" disabled={loading || checking}>
                {loading || checking ? "Please wait…" : l.submitLabel}
              </Button>
              <button
                type="button"
                className="w-full text-center text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
                onClick={l.toggleAction}
              >
                {l.toggle}
              </button>
            </>
          ) : null}
        </div>
      </form>
    </main>
  );
}
