import type { ChatMessage as ChatMessageType } from "@trackstacc/types";
export function ChatMessage({ message }: { message: ChatMessageType }) {
  return (
    <p className="rounded-xl bg-zinc-900 px-3 py-2 text-sm">
      <span className="font-semibold text-brand-200">
        {message.senderNickname ?? "Someone"}:{" "}
      </span>
      {message.deletedAt ? "Message deleted" : message.body}
    </p>
  );
}
