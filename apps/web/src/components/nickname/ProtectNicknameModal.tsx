"use client";

import * as React from "react";
import { Button, Input, Modal, Spinner } from "@trackstacc/ui";
import type { JoinRoomResponse } from "@trackstacc/types";
import { api } from "@/lib/api";

type ProtectNicknameModalProps = {
  open: boolean;
  roomSlug: string;
  listenerSessionId: string | null;
  onClose: () => void;
  onUpgrade: (response: JoinRoomResponse) => void;
};

type Mode = "auth" | "new";

interface FieldErrors {
  nickname?: string;
  password?: string;
  confirm?: string;
}

const MIN_PASSWORD_LENGTH = 10;

const MODE_LABELS: Record<
  Mode,
  {
    title: string;
    subtitle: string;
    submitLabel: string;
    toggleLabel: string;
  }
> = {
  auth: {
    title: "Sign in with your nickname",
    subtitle: "Use your protected nickname to chat, vote, and add tracks.",
    submitLabel: "Sign in and join",
    toggleLabel: "New here? Create a protected nickname",
  },
  new: {
    title: "Create a protected nickname",
    subtitle:
      "Pick a nickname and protect it with a password. No email required.",
    submitLabel: "Create nickname and join",
    toggleLabel: "Already have one? Sign in",
  },
};

const NO_RECOVERY_WARNING =
  "No password recovery exists yet. If you forget this password, you cannot recover this nickname.";

export function parseErrorCode(caught: unknown): string | null {
  if (!(caught instanceof Error)) return null;
  try {
    const body = JSON.parse(caught.message) as { error?: { code?: string } };
    return body.error?.code ?? null;
  } catch {
    return null;
  }
}

export function getFieldErrors(
  nickname: string,
  password: string,
  confirm: string,
  mode: Mode,
): FieldErrors {
  const errors: FieldErrors = {};
  if (!nickname.trim()) {
    errors.nickname = "Nickname is required.";
  }
  if (!password) {
    errors.password = "Password is required.";
  } else if (mode === "new" && password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (mode === "new" && password !== confirm) {
    errors.confirm = "Passwords do not match.";
  }
  return errors;
}

export function errorMessageFromCode(code: string): string {
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

export function ProtectNicknameModal({
  open,
  roomSlug,
  listenerSessionId,
  onClose,
  onUpgrade,
}: ProtectNicknameModalProps) {
  const [mode, setMode] = React.useState<Mode>("auth");
  const [displayNickname, setDisplayNickname] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [apiError, setApiError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [suggestion, setSuggestion] = React.useState<{
    message: string;
    targetMode: Mode;
    prefilledNickname: string;
  } | null>(null);

  // Reset form state when modal opens
  React.useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode("auth");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayNickname("");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPassword("");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConfirm("");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChecking(false);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setApiError(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFieldErrors({});
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggestion(null);
    }
  }, [open]);

  function handleClose() {
    if (!loading && !checking) onClose();
  }

  function followSuggestion() {
    if (!suggestion) return;
    setMode(suggestion.targetMode);
    setDisplayNickname(suggestion.prefilledNickname);
    setPassword("");
    setConfirm("");
    setApiError(null);
    setFieldErrors({});
    setSuggestion(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setApiError(null);
    setSuggestion(null);

    const errors = getFieldErrors(displayNickname, password, confirm, mode);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);

    try {
      // Check nickname status before committing to join
      let protectedStatus: boolean | null = null;
      try {
        setChecking(true);
        const check = await api.checkNickname({
          displayNickname: displayNickname.trim(),
        });
        protectedStatus = check.protected;
        setChecking(false);
      } catch {
        // If check fails, proceed to /join — the backend will enforce
        setChecking(false);
      }

      if (mode === "auth" && protectedStatus === false) {
        // Sign-in mode: nickname is not protected, offer to create
        setSuggestion({
          message:
            "No protected nickname found for this name. Create it instead?",
          targetMode: "new",
          prefilledNickname: displayNickname.trim(),
        });
        setLoading(false);
        return;
      }

      if (mode === "new" && protectedStatus === true) {
        // Create mode: nickname is already protected, offer to sign in
        setSuggestion({
          message: "That nickname is already protected. Sign in instead.",
          targetMode: "auth",
          prefilledNickname: displayNickname.trim(),
        });
        setLoading(false);
        return;
      }

      const requestBody: Record<string, string> = {
        displayNickname: displayNickname.trim(),
        nicknamePassword: password,
      };
      if (listenerSessionId) {
        requestBody.listenerSessionId = listenerSessionId;
      }

      const response = await api.joinRoom(roomSlug, requestBody);
      onUpgrade(response);
    } catch (caught) {
      const code = parseErrorCode(caught);
      setApiError(
        code ? errorMessageFromCode(code) : "Something went wrong. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    const newMode = mode === "auth" ? "new" : "auth";
    setMode(newMode);
    setApiError(null);
    setFieldErrors({});
    setSuggestion(null);
    setPassword("");
    setConfirm("");
  }

  const labels = MODE_LABELS[mode];
  const showSuggestion = suggestion !== null;

  return (
    <Modal open={open} title={labels.title} onClose={handleClose}>
      <form
        onSubmit={(e) => {
          handleSubmit(e).catch(() => undefined);
        }}
        className="space-y-4"
      >
        <p className="text-sm text-zinc-300">{labels.subtitle}</p>

        {mode === "new" ? (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            {NO_RECOVERY_WARNING}
          </p>
        ) : null}

        {showSuggestion ? (
          <div className="space-y-2 rounded-xl border border-brand-500/30 bg-brand-500/10 p-3">
            <p className="text-sm text-brand-200">{suggestion.message}</p>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={followSuggestion}
            >
              {suggestion.targetMode === "new"
                ? "Create a protected nickname"
                : "Sign in instead"}
            </Button>
          </div>
        ) : (
          <>
            <Input
              label="Nickname"
              value={displayNickname}
              onChange={(event) => {
                setDisplayNickname(event.target.value);
                setApiError(null);
              }}
              {...(fieldErrors.nickname !== undefined
                ? { error: fieldErrors.nickname }
                : {})}
              required
              autoFocus
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setApiError(null);
              }}
              {...(fieldErrors.password !== undefined
                ? { error: fieldErrors.password }
                : {})}
              required
            />

            {mode === "new" ? (
              <Input
                label="Confirm password"
                type="password"
                value={confirm}
                onChange={(event) => {
                  setConfirm(event.target.value);
                  setApiError(null);
                }}
                {...(fieldErrors.confirm !== undefined
                  ? { error: fieldErrors.confirm }
                  : {})}
                required
              />
            ) : null}

            {apiError ? (
              <p className="text-sm text-red-400">{apiError}</p>
            ) : null}

            <Button className="w-full" disabled={loading || checking}>
              {loading || checking ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner /> {loading ? "Joining…" : "Checking…"}
                </span>
              ) : (
                labels.submitLabel
              )}
            </Button>
          </>
        )}

        {!showSuggestion ? (
          <button
            type="button"
            className="w-full text-center text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
            onClick={toggleMode}
          >
            {labels.toggleLabel}
          </button>
        ) : null}
      </form>
    </Modal>
  );
}
