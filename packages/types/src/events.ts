import type {
  ChatMessage,
  MechanicChangedPayload,
  ModerationActionInput,
  ModerationAppliedPayload,
  Participant,
  PlaybackState,
  PlaylistMechanic,
  QueueItem,
  RoomSettings,
  RoomSnapshot,
} from "./domain";

export type ClientEvent =
  | { type: "chat.send"; body: string; tempId?: string }
  | { type: "queue.add"; youtubeUrl: string }
  | { type: "queue.vote"; queueItemId: string; vote: 1 | -1 }
  | { type: "playback.skipVote" }
  | {
      type: "playback.clientState";
      status: string;
      positionSeconds: number;
      queueItemId?: string;
    }
  | { type: "presence.heartbeat" }
  | { type: "room.settings.update"; settings: Partial<RoomSettings> }
  | { type: "room.mechanic.change"; mechanic: PlaylistMechanic }
  | { type: "moderation.action"; action: ModerationActionInput };

export type ServerEvent =
  | { type: "room.snapshot"; payload: RoomSnapshot }
  | { type: "presence.updated"; participants: Participant[] }
  | { type: "chat.message"; message: ChatMessage }
  | { type: "chat.deleted"; messageId: string }
  | { type: "queue.updated"; queue: QueueItem[] }
  | { type: "queue.item.added"; item: QueueItem }
  | { type: "queue.item.removed"; queueItemId: string }
  | { type: "queue.vote.updated"; queueItemId: string; score: number }
  | { type: "playback.state"; state: PlaybackState }
  | { type: "playback.resync"; state: PlaybackState }
  | { type: "room.settings.changed"; settings: Partial<RoomSettings> }
  | { type: "room.mechanic.changed"; payload: MechanicChangedPayload }
  | { type: "moderation.applied"; payload: ModerationAppliedPayload }
  | {
      type: "error";
      code: string;
      message: string;
      details?: unknown;
      tempId?: string;
    };
