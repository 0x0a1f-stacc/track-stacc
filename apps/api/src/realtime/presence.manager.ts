import type { FastifyInstance } from "fastify";
import { AccessTier, Role } from "@trackstacc/types";

type PresenceSession = {
  id: string;
  displayNickname: string | null;
  normalizedNickname: string | null;
  accessTier: "listener" | "member";
  role: "listener" | "participant" | "moderator" | "host";
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
    listener: Role.Listener,
    participant: Role.Participant,
    moderator: Role.Moderator,
    host: Role.Host,
  } as const;
  const tierMap = {
    listener: AccessTier.Listener,
    member: AccessTier.Member,
  } as const;
  return sessions.map((session) => ({
    roomSessionId: session.id,
    displayNickname: session.displayNickname,
    normalizedNickname: session.normalizedNickname,
    accessTier: tierMap[session.accessTier],
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
