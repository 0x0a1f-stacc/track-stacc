import type { FastifyInstance } from "fastify";
import { Role } from "@trackstacc/types";

type PresenceSession = {
  id: string;
  displayNickname: string;
  normalizedNickname: string;
  role: "participant" | "moderator" | "host";
  nicknameClaimId: string | null;
  isMuted: boolean;
  joinedAt: Date;
  lastSeenAt: Date;
};

export async function getParticipants(app: FastifyInstance, roomId: string) {
  const activeSince = new Date(Date.now() - 90_000);
  const sessions = (await app.prisma.roomSession.findMany({
    where: { roomId, leftAt: null },
    orderBy: { joinedAt: "asc" },
  })) as PresenceSession[];
  const roleMap = {
    participant: Role.Participant,
    moderator: Role.Moderator,
    host: Role.Host,
  } as const;
  return sessions.map((session) => ({
    roomSessionId: session.id,
    displayNickname: session.displayNickname,
    normalizedNickname: session.normalizedNickname,
    role: roleMap[session.role],
    protectedNickname: Boolean(session.nicknameClaimId),
    presence:
      session.lastSeenAt >= activeSince
        ? ("online" as const)
        : ("offline" as const),
    isMuted: session.isMuted,
    joinedAt: session.joinedAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
  }));
}
