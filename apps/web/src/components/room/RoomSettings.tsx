"use client";
import { MechanicBadge } from "./MechanicBadge";
import { useRoomStore } from "@/stores/room.store";
export function RoomSettings() {
  const room = useRoomStore((state) => state.room);
  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950/80 p-4">
      <h2 className="font-bold">Room Settings</h2>
      <div className="mt-2">
        {room ? <MechanicBadge mechanic={room.playlistMechanic} /> : null}
      </div>
    </section>
  );
}
