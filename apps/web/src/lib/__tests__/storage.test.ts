import { AccessTier } from "@trackstacc/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRoomCredentials,
  getRoomCredentials,
  persistListenerCredentials,
  persistMemberCredentials,
} from "../storage";

class MockStorage implements Storage {
  private store: Record<string, string> = {};

  get length() {
    return Object.keys(this.store).length;
  }

  clear() {
    this.store = {};
  }

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  key(index: number): string | null {
    return Object.keys(this.store)[index] ?? null;
  }

  removeItem(key: string) {
    delete this.store[key];
  }

  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }
}

describe("storage utility", () => {
  const mockSessionStorage = new MockStorage();
  const mockLocalStorage = new MockStorage();

  beforeEach(() => {
    mockSessionStorage.clear();
    mockLocalStorage.clear();

    vi.stubGlobal("window", {});
    vi.stubGlobal("sessionStorage", mockSessionStorage);
    vi.stubGlobal("localStorage", mockLocalStorage);
  });

  it("returns null when storage is empty", () => {
    const creds = getRoomCredentials("test-room");
    expect(creds).toBeNull();
  });

  it("persistMemberCredentials stores in both sessionStorage and localStorage and removes listenerSessionId", () => {
    // Setup initial listener session ID
    mockSessionStorage.setItem("ws:test-room:listenerSessionId", "listen-123");
    mockLocalStorage.setItem("ws:test-room:listenerSessionId", "listen-123");

    persistMemberCredentials("test-room", "member-token-abc", "member");

    // Check sessionStorage
    expect(mockSessionStorage.getItem("ws:test-room")).toBe("member-token-abc");
    expect(mockSessionStorage.getItem("ws:test-room:tier")).toBe("member");
    expect(mockSessionStorage.getItem("ws:test-room:listenerSessionId")).toBeNull();

    // Check localStorage
    expect(mockLocalStorage.getItem("ws:test-room")).toBe("member-token-abc");
    expect(mockLocalStorage.getItem("ws:test-room:tier")).toBe("member");
    expect(mockLocalStorage.getItem("ws:test-room:listenerSessionId")).toBeNull();
  });

  it("persistListenerCredentials stores in sessionStorage only", () => {
    persistListenerCredentials("test-room", "listen-token-123", "listener", "session-xyz");

    // Check sessionStorage has it
    expect(mockSessionStorage.getItem("ws:test-room")).toBe("listen-token-123");
    expect(mockSessionStorage.getItem("ws:test-room:tier")).toBe("listener");
    expect(mockSessionStorage.getItem("ws:test-room:listenerSessionId")).toBe("session-xyz");

    // Check localStorage does not have it
    expect(mockLocalStorage.getItem("ws:test-room")).toBeNull();
    expect(mockLocalStorage.getItem("ws:test-room:tier")).toBeNull();
    expect(mockLocalStorage.getItem("ws:test-room:listenerSessionId")).toBeNull();
  });

  it("getRoomCredentials prioritizes sessionStorage over localStorage", () => {
    persistListenerCredentials("test-room", "listen-token", "listener", "sess-id");
    persistMemberCredentials("test-room", "member-token", "member");

    // sessionStorage has member-token (due to persistMemberCredentials writing to both)
    // Let's manually overwrite sessionStorage to simulate divergence (e.g. listener session in session)
    mockSessionStorage.setItem("ws:test-room", "session-token");
    mockSessionStorage.setItem("ws:test-room:tier", "listener");
    mockSessionStorage.setItem("ws:test-room:listenerSessionId", "sess-xyz");

    const creds = getRoomCredentials("test-room");
    expect(creds).not.toBeNull();
    expect(creds?.token).toBe("session-token");
    expect(creds?.tier).toBe(AccessTier.Listener);
    expect(creds?.listenerSessionId).toBe("sess-xyz");
    expect(creds?.source).toBe("session");
  });

  it("getRoomCredentials falls back to localStorage if sessionStorage is empty", () => {
    persistMemberCredentials("test-room", "member-token", "member");

    // Simulate tab reopen (sessionStorage is empty)
    mockSessionStorage.clear();

    const creds = getRoomCredentials("test-room");
    expect(creds).not.toBeNull();
    expect(creds?.token).toBe("member-token");
    expect(creds?.tier).toBe(AccessTier.Member);
    expect(creds?.listenerSessionId).toBeNull();
    expect(creds?.source).toBe("local");
  });

  it("getRoomCredentials returns null if token is present but tier is missing (prevents partial restore)", () => {
    mockLocalStorage.setItem("ws:test-room", "some-token");
    // ws:test-room:tier is missing

    const creds = getRoomCredentials("test-room");
    expect(creds).toBeNull();
  });

  it("clearRoomCredentials removes all items from both storage locations", () => {
    persistMemberCredentials("test-room", "member-token", "member");
    mockSessionStorage.setItem("ws:test-room:listenerSessionId", "xyz");
    mockLocalStorage.setItem("ws:test-room:listenerSessionId", "xyz");

    clearRoomCredentials("test-room");

    expect(mockSessionStorage.getItem("ws:test-room")).toBeNull();
    expect(mockSessionStorage.getItem("ws:test-room:tier")).toBeNull();
    expect(mockSessionStorage.getItem("ws:test-room:listenerSessionId")).toBeNull();

    expect(mockLocalStorage.getItem("ws:test-room")).toBeNull();
    expect(mockLocalStorage.getItem("ws:test-room:tier")).toBeNull();
    expect(mockLocalStorage.getItem("ws:test-room:listenerSessionId")).toBeNull();
  });
});
