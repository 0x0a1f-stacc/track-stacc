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

type Mode = "new" | "auth";

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
    submitLabel: string;
    toggleLabel: string;
  }
> = {
  new: {
    title: "Protect your nickname",
    submitLabel: "Protect & join",
    toggleLabel: "I already have a protected nickname",
  },
  auth: {
    title: "Authenticate your nickname",
    submitLabel: "Authenticate & join",
    toggleLabel: "I need a new protected nickname",
  },
};

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
  const [mode, setMode] = React.useState<Mode>("new");
  const [displayNickname, setDisplayNickname] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [apiError, setApiError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});

  // Reset form state when modal opens
  React.useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode("new");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayNickname("");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPassword("");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConfirm("");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setApiError(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFieldErrors({});
    }
  }, [open]);

  function handleClose() {
    if (!loading) onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setApiError(null);

    const errors = getFieldErrors(displayNickname, password, confirm, mode);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);

    try {
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

      if (code === "NICKNAME_PROTECTED") {
        // Switch to auth mode if the nickname is protected
        setMode("auth");
        setApiError(errorMessageFromCode(code));
      } else if (code === "NICKNAME_TAKEN") {
        setApiError(errorMessageFromCode(code));
      } else {
        setApiError(
          code
            ? errorMessageFromCode(code)
            : "Something went wrong. Try again.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    setMode(mode === "new" ? "auth" : "new");
    setApiError(null);
    setFieldErrors({});
    setPassword("");
    setConfirm("");
  }

  const labels = MODE_LABELS[mode];

  return (
    <Modal open={open} title={labels.title} onClose={handleClose}>
      <form
        onSubmit={(e) => {
          handleSubmit(e).catch(() => undefined);
        }}
        className="space-y-4"
      >
        <div className="space-y-2 text-sm text-zinc-300">
          <p>
            You need a protected nickname to chat, add songs, vote, and
            participate.
          </p>
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-amber-200">
            Protected nicknames cannot be recovered if you forget the password.
          </p>
        </div>

        <Input
          label="Nickname"
          value={displayNickname}
          onChange={(event) => {
            setDisplayNickname(event.target.value);
            if (fieldErrors.nickname) {
              setFieldErrors((prev) => ({ ...prev }));
            }
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
            if (fieldErrors.password) {
              setFieldErrors((prev) => ({ ...prev }));
            }
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
              if (fieldErrors.confirm) {
                setFieldErrors((prev) => ({ ...prev }));
              }
            }}
            {...(fieldErrors.confirm !== undefined
              ? { error: fieldErrors.confirm }
              : {})}
            required
          />
        ) : null}

        {apiError ? <p className="text-sm text-red-400">{apiError}</p> : null}

        <Button className="w-full" disabled={loading}>
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Spinner /> {labels.submitLabel}…
            </span>
          ) : (
            labels.submitLabel
          )}
        </Button>

        <button
          type="button"
          className="w-full text-center text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
          onClick={toggleMode}
        >
          {labels.toggleLabel}
        </button>
      </form>
    </Modal>
  );
}
