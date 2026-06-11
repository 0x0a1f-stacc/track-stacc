import { describe, it, expect, beforeEach } from "vitest";
import { AccessTier } from "@trackstacc/types";
import { useRoomStore } from "../room.store";

describe("useRoomStore", () => {
  beforeEach(() => {
    // Reset the store to initial state before each test
    useRoomStore.getState().resetRoomState();
  });

  it("starts with null room and null token", () => {
    const state = useRoomStore.getState();
    expect(state.room).toBeNull();
    expect(state.websocketToken).toBeNull();
    expect(state.ownAccessTier).toBeNull();
    expect(state.listenerSessionId).toBeNull();
  });

  it("setToken updates websocketToken", () => {
    useRoomStore.getState().setToken("test-token");
    expect(useRoomStore.getState().websocketToken).toBe("test-token");
  });

  it("setOwnAccessTier updates tier", () => {
    useRoomStore.getState().setOwnAccessTier(AccessTier.Member);
    expect(useRoomStore.getState().ownAccessTier).toBe(AccessTier.Member);
  });

  it("setListenerSessionId updates listener session id", () => {
    useRoomStore.getState().setListenerSessionId("session-123");
    expect(useRoomStore.getState().listenerSessionId).toBe("session-123");
  });

  it("resetRoomState clears all room-scoped state", () => {
    // Set some state
    useRoomStore.getState().setToken("room1-token");
    useRoomStore.getState().setOwnAccessTier(AccessTier.Member);
    useRoomStore.getState().setListenerSessionId("room1-session");

    // Verify it's set
    expect(useRoomStore.getState().websocketToken).toBe("room1-token");

    // Reset
    useRoomStore.getState().resetRoomState();

    // Verify all state is cleared
    const state = useRoomStore.getState();
    expect(state.room).toBeNull();
    expect(state.websocketToken).toBeNull();
    expect(state.ownAccessTier).toBeNull();
    expect(state.listenerSessionId).toBeNull();
    expect(state.queue).toHaveLength(0);
    expect(state.chat).toHaveLength(0);
    expect(state.participants).toHaveLength(0);
    expect(state.playback).toBeNull();
    expect(state.lastError).toBeNull();
  });
});
