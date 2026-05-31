"use client";

import type {
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
  setToken: (token: string) => void;
  applyEvent: (event: ServerEvent) => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  room: null,
  queue: [],
  chat: [],
  participants: [],
  playback: null,
  websocketToken: null,
  setToken: (token) => set({ websocketToken: token }),
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
      return {};
    }),
}));
