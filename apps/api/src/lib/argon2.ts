import argon2 from "argon2";

const memoryCost = Number(process.env.ARGON2_MEMORY_COST ?? 65_536);
const timeCost = Number(process.env.ARGON2_TIME_COST ?? 3);
const parallelism = Number(process.env.ARGON2_PARALLELISM ?? 1);

export function hashPassword(password: string) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost,
    timeCost,
    parallelism,
  });
}

export function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}
