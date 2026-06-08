"use client";
import { Role } from "@trackstacc/types";
import { Avatar, Badge } from "@trackstacc/ui";
import { usePresence } from "@/hooks/usePresence";
export function ParticipantList() {
  const participants = usePresence();
  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950/80 p-4">
      <h2 className="font-bold">Participants</h2>
      <div className="mt-3 space-y-2">
        {participants.map((participant) => (
          <div
            key={participant.roomSessionId}
            className="flex items-center gap-3"
          >
            <Avatar nickname={participant.displayNickname} />
            <span className="flex-1">{participant.displayNickname}</span>
            {participant.role !== Role.Participant ? (
              <Badge tone={participant.role === Role.Host ? "host" : "mod"}>
                {participant.role}
              </Badge>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
