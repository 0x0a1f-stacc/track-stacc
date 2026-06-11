"use client";

import type {
  AccessTier,
  ChatMessage,
  Participant,
  PlaybackState,
  QueueItem,
  Room,
  ServerEvent,
} from "@trackstacc/types";
import { create } from "zustand";

interface RoomState {
  room: Room | null;
  queue: QueueItem[];
  chat: ChatMessage[];
  participants: Participant[];
  playback: PlaybackState | null;
  websocketToken: string | null;
  listenerSessionId: string | null;
  lastError: string | null;
  ownAccessTier: AccessTier | null;
  setToken: (token: string) => void;
  setListenerSessionId: (id: string | null) => void;
  setOwnAccessTier: (tier: AccessTier | null) => void;
  applyEvent: (event: ServerEvent) => void;
  /** Reset all room-scoped state when navigating between rooms. */
  resetRoomState: () => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  room: null,
  queue: [],
  chat: [],
  participants: [],
  playback: null,
  websocketToken: null,
  listenerSessionId: null,
  lastError: null,
  ownAccessTier: null,
  setToken: (token) => set({ websocketToken: token }),
  setListenerSessionId: (id) => set({ listenerSessionId: id }),
  setOwnAccessTier: (tier) => set({ ownAccessTier: tier }),
  resetRoomState: () =>
    set({
      room: null,
      queue: [],
      chat: [],
      participants: [],
      playback: null,
      websocketToken: null,
      listenerSessionId: null,
      lastError: null,
      ownAccessTier: null,
    }),
  applyEvent: (event) =>
    set((state) => {
      if (event.type === "room.snapshot")
        return {
          room: event.payload.room,
          queue: event.payload.queue,
          chat: event.payload.recentMessages,
          participants: event.payload.participants,
          playback: event.payload.currentPlayback,
        };
      if (event.type === "presence.updated")
        return { participants: event.participants };
      if (event.type === "chat.message")
        return {
          chat: [
            ...state.chat.filter(
              (message) => message.tempId !== event.message.tempId,
            ),
            event.message,
          ],
        };
      if (event.type === "chat.deleted")
        return {
          chat: state.chat.map((message) =>
            message.id === event.messageId
              ? { ...message, deletedAt: new Date().toISOString() }
              : message,
          ),
        };
      if (event.type === "queue.updated") return { queue: event.queue };
      if (event.type === "queue.item.added")
        return { queue: [...state.queue, event.item] };
      if (event.type === "queue.item.removed")
        return {
          queue: state.queue.filter((item) => item.id !== event.queueItemId),
        };
      if (event.type === "queue.vote.updated")
        return {
          queue: state.queue.map((item) =>
            item.id === event.queueItemId
              ? { ...item, score: event.score }
              : item,
          ),
        };
      if (event.type === "playback.state" || event.type === "playback.resync")
        return { playback: event.state };
      if (event.type === "room.settings.changed" && state.room)
        return { room: { ...state.room, ...event.settings } };
      if (event.type === "error") return { lastError: event.message };
      return {};
    }),
}));
