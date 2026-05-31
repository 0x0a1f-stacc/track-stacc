import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";

const prisma = new PrismaClient();

async function main() {
  const hostToken = "dev-host-token";
  const sessionToken = "dev-session-token";
  const hostSecretHash = await argon2.hash(hostToken, {
    type: argon2.argon2id,
  });
  const sessionTokenHash = createHash("sha256")
    .update(sessionToken)
    .digest("hex");

  const room = await prisma.room.upsert({
    where: { slug: "dev-room" },
    update: {},
    create: {
      slug: "dev-room",
      name: "Development Room",
      hostSecretHash,
      playlistMechanic: "fifo",
    },
  });

  await prisma.roomSession.upsert({
    where: { sessionTokenHash },
    update: { lastSeenAt: new Date() },
    create: {
      roomId: room.id,
      displayNickname: "Dev Host",
      normalizedNickname: "dev host",
      role: "host",
      sessionTokenHash: sessionTokenHash || randomBytes(32).toString("hex"),
    },
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
