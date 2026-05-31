export enum PlaylistMechanic {
  FIFO = "fifo",
  Voting = "voting",
  DjRotation = "dj_rotation",
  HostCurated = "host_curated",
  Suggestions = "suggestions",
}

export enum Role {
  Participant = "participant",
  Moderator = "moderator",
  Host = "host",
}

export enum QueueItemStatus {
  Suggested = "suggested",
  Queued = "queued",
  Playing = "playing",
  Played = "played",
  Skipped = "skipped",
  Removed = "removed",
  Failed = "failed",
  Rejected = "rejected",
}

export enum ChatMessageType {
  User = "user",
  System = "system",
  Moderation = "moderation",
  Song = "song",
}

export enum PlaybackStatus {
  Playing = "playing",
  Paused = "paused",
  Buffering = "buffering",
  Ended = "ended",
  Stopped = "stopped",
}

export enum RoomVisibility {
  PrivateLink = "private_link",
  Public = "public",
  PasswordProtected = "password_protected",
}

export enum DuplicatePolicy {
  Allow = "allow",
  BlockQueue = "block_queue",
  BlockRecent = "block_recent",
  BlockSession = "block_session",
}

export enum SkipVoteThresholdType {
  Percentage = "percentage",
  FixedCount = "fixed_count",
}

export type JsonRecord = Record<string, unknown>;

export interface RoomSettings {
  visibility: RoomVisibility;
  maxSongDurationSeconds: number;
  duplicatePolicy: DuplicatePolicy;
  skipVoteThresholdType: SkipVoteThresholdType;
  skipVoteThresholdValue: number;
  queueLocked: boolean;
  chatLocked: boolean;
}

export interface Room extends RoomSettings {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  playlistMechanic: PlaylistMechanic;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
}

export interface Track {
  id?: string;
  provider: "youtube";
  videoId: string;
  title: string | null;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  isEmbeddable?: boolean | null;
}

export interface QueueItem {
  id: string;
  roomId: string;
  track: Track;
  addedBySessionId: string | null;
  addedBy?: string | null;
  status: QueueItemStatus;
  position: number | null;
  score: number;
  mechanicContext: JsonRecord;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderSessionId: string | null;
  senderNickname: string | null;
  type: ChatMessageType;
  body: string;
  metadata: JsonRecord;
  deletedAt: string | null;
  createdAt: string;
  tempId?: string;
}

export interface Participant {
  roomSessionId: string;
  displayNickname: string;
  normalizedNickname: string;
  role: Role;
  protectedNickname: boolean;
  presence: "online" | "idle" | "offline";
  isMuted: boolean;
  joinedAt: string;
  lastSeenAt: string;
}

export interface PlaybackState {
  roomId: string;
  queueItemId: string | null;
  videoId: string | null;
  title: string | null;
  status: PlaybackStatus;
  startedAt: string | null;
  serverPositionSeconds: number;
  updatedAt: string;
}

export interface RoomSnapshot {
  room: Room;
  currentPlayback: PlaybackState;
  queue: QueueItem[];
  participants: Participant[];
  recentMessages: ChatMessage[];
}

export interface MechanicChangedPayload {
  roomId: string;
  actor: Pick<Participant, "displayNickname" | "role">;
  oldMechanic: PlaylistMechanic;
  newMechanic: PlaylistMechanic;
  queueTransitionPolicy: "preserve_existing_order";
  currentTrackUnaffected: true;
  createdAt: string;
}

export interface ModerationActionInput {
  action:
    | "mute"
    | "unmute"
    | "ban"
    | "unban"
    | "delete_message"
    | "remove_queue_item"
    | "force_skip";
  targetSessionId?: string;
  queueItemId?: string;
  messageId?: string;
  reason?: string;
}

export interface ModerationAppliedPayload extends ModerationActionInput {
  roomId: string;
  actorSessionId: string | null;
  createdAt: string;
}
