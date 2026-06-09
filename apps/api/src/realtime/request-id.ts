import { nanoid } from "nanoid";

export function generateEventRequestId(): string {
  return `ws_${nanoid(17)}`;
}
