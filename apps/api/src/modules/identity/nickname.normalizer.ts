import { AppError } from "../../lib/errors.js";

const reserved = new Set([
  "admin",
  "system",
  "moderator",
  "host",
  "youtube",
  "support",
]);
const confusableMap = new Map<string, string>([
  ["а", "a"],
  ["е", "e"],
  ["о", "o"],
  ["р", "p"],
  ["с", "c"],
  ["у", "y"],
  ["х", "x"],
  ["і", "i"],
  ["Ⅰ", "i"],
  ["０", "0"],
]);

function skeleton(value: string) {
  return Array.from(value)
    .map((char) => confusableMap.get(char) ?? char)
    .join("");
}

export function normalizeNickname(input: string) {
  const displayNickname = input.trim().replace(/\s+/gu, " ").normalize("NFKC");
  if (/\p{Cc}|\p{Cf}/u.test(displayNickname))
    throw new AppError(
      "INVALID_NICKNAME",
      "Nickname contains unsupported characters.",
    );
  const normalizedNickname = displayNickname
    .toLocaleLowerCase()
    .normalize("NFKC");
  if (normalizedNickname.length < 2 || normalizedNickname.length > 24)
    throw new AppError("INVALID_NICKNAME", "Nickname must be 2-24 characters.");
  if (!/^[\p{L}\p{N}_\- ]+$/u.test(normalizedNickname))
    throw new AppError(
      "INVALID_NICKNAME",
      "Nickname contains unsupported characters.",
    );
  const normalizedSkeleton = skeleton(normalizedNickname);
  if (reserved.has(normalizedNickname) || reserved.has(normalizedSkeleton))
    throw new AppError("RESERVED_NICKNAME", "That nickname is reserved.");
  return { displayNickname, normalizedNickname };
}
