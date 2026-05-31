import type {
  AddQueueItemRequest,
  AddQueueItemResponse,
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
} from "@trackstacc/types";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    credentials: "include",
    headers: { "content-type": "application/json", ...init?.headers },
    ...init,
  });
  if (!response.ok)
    throw new Error((await response.text()) || "Request failed");
  return response.json() as Promise<T>;
}

export const api = {
  createRoom: (body: CreateRoomRequest) =>
    request<CreateRoomResponse>("/api/rooms", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getRoom: (roomSlug: string) =>
    request<{
      room: {
        id: string;
        slug: string;
        name: string;
        playlistMechanic: string;
      };
    }>(`/api/rooms/${roomSlug}`, { cache: "no-store" }),
  joinRoom: (roomSlug: string, body: JoinRoomRequest) =>
    request<JoinRoomResponse>(`/api/rooms/${roomSlug}/join`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  addQueueItem: (roomId: string, body: AddQueueItemRequest) =>
    request<AddQueueItemResponse>(`/api/rooms/${roomId}/queue/items`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  skip: (roomId: string) =>
    request<{ ok: true }>(`/api/rooms/${roomId}/playback/skip`, {
      method: "POST",
    }),
};
