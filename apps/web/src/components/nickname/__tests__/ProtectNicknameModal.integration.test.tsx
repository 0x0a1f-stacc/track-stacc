import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Role } from "@trackstacc/types";
import type { JoinRoomResponse } from "@trackstacc/types";
import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { ProtectNicknameModal } from "../ProtectNicknameModal";

import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    checkNickname: vi.fn(),
    joinRoom: vi.fn(),
  },
}));

describe("ProtectNicknameModal Integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders in auth (sign-in) mode by default", () => {
    render(
      <ProtectNicknameModal
        open={true}
        roomSlug="test-room"
        listenerSessionId="listener-session-123"
        onClose={vi.fn()}
        onUpgrade={vi.fn()}
      />,
    );

    expect(screen.getByText("Sign in with your nickname")).toBeInTheDocument();
    expect(screen.getByLabelText("Nickname")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByLabelText("Confirm password")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in and join" })).toBeInTheDocument();
  });

  it("toggles to new nickname creation mode and back", () => {
    render(
      <ProtectNicknameModal
        open={true}
        roomSlug="test-room"
        listenerSessionId="listener-session-123"
        onClose={vi.fn()}
        onUpgrade={vi.fn()}
      />,
    );

    const toggleButton = screen.getByText("New here? Create a protected nickname");
    fireEvent.click(toggleButton);

    expect(screen.getByText("Create a protected nickname")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create nickname and join" })).toBeInTheDocument();

    const toggleBack = screen.getByText("Already have one? Sign in");
    fireEvent.click(toggleBack);

    expect(screen.getByText("Sign in with your nickname")).toBeInTheDocument();
    expect(screen.queryByLabelText("Confirm password")).not.toBeInTheDocument();
  });

  it("displays validation errors for empty fields", () => {
    render(
      <ProtectNicknameModal
        open={true}
        roomSlug="test-room"
        listenerSessionId="listener-session-123"
        onClose={vi.fn()}
        onUpgrade={vi.fn()}
      />,
    );

    const form = screen.getByRole("dialog").querySelector("form")!;
    fireEvent.submit(form);

    expect(screen.getByText("Nickname is required.")).toBeInTheDocument();
    expect(screen.getByText("Password is required.")).toBeInTheDocument();
  });

  it("displays validation errors in new mode for short/mismatched passwords", () => {
    render(
      <ProtectNicknameModal
        open={true}
        roomSlug="test-room"
        listenerSessionId="listener-session-123"
        onClose={vi.fn()}
        onUpgrade={vi.fn()}
      />,
    );

    const toggleButton = screen.getByText("New here? Create a protected nickname");
    fireEvent.click(toggleButton);

    const nicknameInput = screen.getByLabelText("Nickname");
    const passwordInput = screen.getByLabelText("Password");
    const confirmInput = screen.getByLabelText("Confirm password");
    const submitButton = screen.getByRole("button", { name: "Create nickname and join" });

    fireEvent.change(nicknameInput, { target: { value: "testuser" } });
    fireEvent.change(passwordInput, { target: { value: "short" } });
    fireEvent.change(confirmInput, { target: { value: "mismatch" } });
    fireEvent.click(submitButton);

    expect(screen.getByText("Password must be at least 10 characters.")).toBeInTheDocument();
    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
  });

  it("suggests switching to new mode when sign-in nickname is not protected", async () => {
    vi.mocked(api.checkNickname).mockResolvedValue({
      normalizedNickname: "unprotected-user",
      protected: false,
      available: true,
    });

    render(
      <ProtectNicknameModal
        open={true}
        roomSlug="test-room"
        listenerSessionId="listener-session-123"
        onClose={vi.fn()}
        onUpgrade={vi.fn()}
      />,
    );

    const nicknameInput = screen.getByLabelText("Nickname");
    const passwordInput = screen.getByLabelText("Password");
    const submitButton = screen.getByRole("button", { name: "Sign in and join" });

    fireEvent.change(nicknameInput, { target: { value: "unprotected-user" } });
    fireEvent.change(passwordInput, { target: { value: "somepassword" } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(api.checkNickname).toHaveBeenCalledWith({ displayNickname: "unprotected-user" });
    });

    expect(
      await screen.findByText("No protected nickname found for this name. Create it instead?"),
    ).toBeInTheDocument();

    const suggestionButton = screen.getByRole("button", { name: "Create a protected nickname" });
    fireEvent.click(suggestionButton);

    expect(screen.getByText("Create a protected nickname")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
    expect(screen.getByLabelText("Nickname")).toHaveValue("unprotected-user");
  });

  it("suggests switching to auth mode when creating a nickname that is already protected", async () => {
    vi.mocked(api.checkNickname).mockResolvedValue({
      normalizedNickname: "protected-user",
      protected: true,
      available: false,
    });

    render(
      <ProtectNicknameModal
        open={true}
        roomSlug="test-room"
        listenerSessionId="listener-session-123"
        onClose={vi.fn()}
        onUpgrade={vi.fn()}
      />,
    );

    const toggleButton = screen.getByText("New here? Create a protected nickname");
    fireEvent.click(toggleButton);

    const nicknameInput = screen.getByLabelText("Nickname");
    const passwordInput = screen.getByLabelText("Password");
    const confirmInput = screen.getByLabelText("Confirm password");
    const submitButton = screen.getByRole("button", { name: "Create nickname and join" });

    fireEvent.change(nicknameInput, { target: { value: "protected-user" } });
    fireEvent.change(passwordInput, { target: { value: "password12345" } });
    fireEvent.change(confirmInput, { target: { value: "password12345" } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(api.checkNickname).toHaveBeenCalledWith({ displayNickname: "protected-user" });
    });

    expect(
      await screen.findByText("That nickname is already protected. Sign in instead."),
    ).toBeInTheDocument();

    const suggestionButton = screen.getByRole("button", { name: "Sign in instead" });
    fireEvent.click(suggestionButton);

    expect(screen.getByText("Sign in with your nickname")).toBeInTheDocument();
    expect(screen.queryByLabelText("Confirm password")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nickname")).toHaveValue("protected-user");
  });

  it("successfully calls onUpgrade and joinRoom with listenerSessionId when submitting", async () => {
    vi.mocked(api.checkNickname).mockResolvedValue({
      normalizedNickname: "testuser",
      protected: true,
      available: false,
    });
    const mockJoinRoomResponse: JoinRoomResponse = {
      websocketToken: "upgraded-member-token",
      session: {
        roomSessionId: "session-abc",
        displayNickname: "testuser",
        accessTier: "member",
        role: Role.Participant,
        protectedNickname: true,
      },
    };
    vi.mocked(api.joinRoom).mockResolvedValue(mockJoinRoomResponse);

    const onUpgrade = vi.fn();
    render(
      <ProtectNicknameModal
        open={true}
        roomSlug="test-room"
        listenerSessionId="listener-session-123"
        onClose={vi.fn()}
        onUpgrade={onUpgrade}
      />,
    );

    const nicknameInput = screen.getByLabelText("Nickname");
    const passwordInput = screen.getByLabelText("Password");
    const submitButton = screen.getByRole("button", { name: "Sign in and join" });

    fireEvent.change(nicknameInput, { target: { value: "testuser" } });
    fireEvent.change(passwordInput, { target: { value: "password12345" } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(api.checkNickname).toHaveBeenCalledWith({ displayNickname: "testuser" });
      expect(api.joinRoom).toHaveBeenCalledWith("test-room", {
        displayNickname: "testuser",
        nicknamePassword: "password12345",
        listenerSessionId: "listener-session-123",
      });
    });

    expect(onUpgrade).toHaveBeenCalledWith(mockJoinRoomResponse);
  });
});
