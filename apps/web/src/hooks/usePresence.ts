"use client";
import { useRoomStore } from "@/stores/room.store";
export function usePresence() {
  return useRoomStore((state) => state.participants);
}
