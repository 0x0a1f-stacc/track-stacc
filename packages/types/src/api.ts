import type {
  DuplicatePolicy,
  PlaylistMechanic,
  QueueItem,
  Role,
  Room,
  RoomSettings,
  RoomVisibility,
} from "./domain";

export interface CreateRoomRequest {
  name?: string;
  description?: string;
  playlistMechanic: PlaylistMechanic;
  visibility?: RoomVisibility;
  maxSongDurationSeconds?: number;
  duplicatePolicy?: DuplicatePolicy;
  roomPassword?: string;
}

export interface CreateRoomResponse {
  room: Pick<Room, "id" | "slug" | "name" | "playlistMechanic">;
  hostToken: string;
}

export interface JoinRoomRequest {
  displayNickname: string;
  nicknamePassword?: string;
  roomPassword?: string;
}

export interface JoinRoomResponse {
  session: {
    roomSessionId: string;
    displayNickname: string;
    role: Role;
    protectedNickname: boolean;
  };
  websocketToken: string;
}

export interface NicknameCheckRequest {
  displayNickname: string;
}
export interface NicknameCheckResponse {
  normalizedNickname: string;
  protected: boolean;
  available: boolean;
}
export interface NicknameProtectRequest {
  displayNickname: string;
  password: string;
}
export interface NicknameAuthenticateRequest extends NicknameProtectRequest {}
export interface NicknameAuthenticateResponse {
  authenticated: boolean;
}
export interface UpdateRoomSettingsRequest {
  settings: Partial<RoomSettings>;
}
export interface PasswordVerifyRequest {
  roomPassword: string;
}
export interface AddQueueItemRequest {
  youtubeUrl: string;
}
export interface AddQueueItemResponse {
  queueItem: QueueItem;
}
export interface QueueVoteRequest {
  vote: 1 | -1;
}
export interface ModerationRequest {
  targetSessionId: string;
  reason?: string;
}
export interface ErrorResponse {
  error: { code: string; message: string; details?: unknown };
}
