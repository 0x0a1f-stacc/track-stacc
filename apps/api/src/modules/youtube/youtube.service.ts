import type { PrismaClient, Track } from "@prisma/client";
import type { Redis } from "ioredis";

import { AppError } from "../../lib/errors.js";

const videoIdPattern = /^[a-zA-Z0-9_-]{11}$/;

export function parseYouTubeVideoId(input: string) {
  const trimmed = input.trim();
  if (videoIdPattern.test(trimmed)) return trimmed;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new AppError("INVALID_YOUTUBE_URL", "Paste a valid YouTube URL.");
  }
  const host = url.hostname.replace(/^www\./u, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0] ?? null;
  if (host.endsWith("youtube.com")) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    if (
      url.pathname.startsWith("/embed/") ||
      url.pathname.startsWith("/shorts/") ||
      url.pathname.startsWith("/live/")
    )
      id = url.pathname.split("/")[2] ?? null;
  }
  if (!id || !videoIdPattern.test(id))
    throw new AppError(
      "INVALID_YOUTUBE_URL",
      "Paste a valid YouTube video URL.",
    );
  return id;
}

export function parseIsoDurationSeconds(duration: string) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/u.exec(duration);
  if (!match) return null;
  return (
    Number(match[1] ?? 0) * 3600 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3] ?? 0)
  );
}

interface YouTubeApiResponse {
  items?: Array<{
    snippet?: {
      title?: string;
      channelTitle?: string;
      thumbnails?: {
        default?: { url?: string };
        medium?: { url?: string };
        high?: { url?: string };
      };
    };
    contentDetails?: { duration?: string };
    status?: { embeddable?: boolean };
  }>;
}

export async function getOrFetchTrack(
  prisma: PrismaClient,
  redis: Redis,
  youtubeUrl: string,
) {
  const videoId = parseYouTubeVideoId(youtubeUrl);
  const cacheKey = `youtube:track:${videoId}`;
  const cached = await redis.get(cacheKey);
  if (cached)
    return JSON.parse(cached) as Track;

  const existing = await prisma.track.findUnique({
    where: {
      provider_providerVideoId: {
        provider: "youtube",
        providerVideoId: videoId,
      },
    },
  });
  if (existing?.metadataStatus === "complete") {
    await redis.set(cacheKey, JSON.stringify(existing), "EX", 86_400);
    return existing;
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return prisma.track.upsert({
      where: {
        provider_providerVideoId: {
          provider: "youtube",
          providerVideoId: videoId,
        },
      },
      update: {},
      create: {
        provider: "youtube",
        providerVideoId: videoId,
        metadataStatus: "partial",
      },
    });
  }

  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,contentDetails,status");
    url.searchParams.set("id", videoId);
    url.searchParams.set("key", apiKey);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`YouTube API ${response.status}`);
    const data = (await response.json()) as YouTubeApiResponse;
    const item = data.items?.[0];
    if (!item)
      throw new AppError(
        "VIDEO_UNAVAILABLE",
        "This video cannot be played here. Try another YouTube link.",
      );
    const durationSeconds = item.contentDetails?.duration
      ? parseIsoDurationSeconds(item.contentDetails.duration)
      : null;
    const track = await prisma.track.upsert({
      where: {
        provider_providerVideoId: {
          provider: "youtube",
          providerVideoId: videoId,
        },
      },
      update: {
        title: item.snippet?.title ?? null,
        channelTitle: item.snippet?.channelTitle ?? null,
        thumbnailUrl:
          item.snippet?.thumbnails?.high?.url ??
          item.snippet?.thumbnails?.medium?.url ??
          item.snippet?.thumbnails?.default?.url ??
          null,
        durationSeconds,
        isEmbeddable: item.status?.embeddable ?? null,
        metadataStatus: "complete",
        metadataFetchedAt: new Date(),
      },
      create: {
        provider: "youtube",
        providerVideoId: videoId,
        title: item.snippet?.title ?? null,
        channelTitle: item.snippet?.channelTitle ?? null,
        thumbnailUrl:
          item.snippet?.thumbnails?.high?.url ??
          item.snippet?.thumbnails?.medium?.url ??
          item.snippet?.thumbnails?.default?.url ??
          null,
        durationSeconds,
        isEmbeddable: item.status?.embeddable ?? null,
        metadataStatus: "complete",
        metadataFetchedAt: new Date(),
      },
    });
    await redis.set(cacheKey, JSON.stringify(track), "EX", 86_400);
    return track;
  } catch {
    return prisma.track.upsert({
      where: {
        provider_providerVideoId: {
          provider: "youtube",
          providerVideoId: videoId,
        },
      },
      update: { metadataStatus: "partial" },
      create: {
        provider: "youtube",
        providerVideoId: videoId,
        metadataStatus: "partial",
      },
    });
  }
}
