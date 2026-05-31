"use client";
import * as React from "react";
import type { ClientEvent } from "@trackstacc/types";
import { Button, Input, SystemMessage } from "@trackstacc/ui";
import { useChat } from "@/hooks/useChat";
import { ChatMessage } from "./ChatMessage";
export function ChatPanel({ emit }: { emit: (event: ClientEvent) => void }) {
  const chat = useChat();
  const [body, setBody] = React.useState("");
  return (
    <section className="flex min-h-[24rem] flex-col rounded-2xl border border-white/10 bg-zinc-950/80 p-4">
      <h2 className="font-bold">Chat</h2>
      <div className="mt-3 flex-1 space-y-2 overflow-auto">
        {chat.map((message) =>
          message.type === "system" ? (
            <SystemMessage key={message.id}>{message.body}</SystemMessage>
          ) : (
            <ChatMessage key={message.id} message={message} />
          ),
        )}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!body.trim()) return;
          emit({ type: "chat.send", body, tempId: crypto.randomUUID() });
          setBody("");
        }}
      >
        <Input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Say something"
        />
        <Button>Send</Button>
      </form>
    </section>
  );
}
