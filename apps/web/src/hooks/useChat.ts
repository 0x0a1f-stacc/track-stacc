"use client";
import { useRoomStore } from "@/stores/room.store";
export function useChat() {
  return useRoomStore((state) => state.chat);
}
