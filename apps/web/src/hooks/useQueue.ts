"use client";
import { useRoomStore } from "@/stores/room.store";
export function useQueue() {
  return useRoomStore((state) => state.queue);
}
