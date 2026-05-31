import { describe, expect, it } from "vitest";
import {
  parseIsoDurationSeconds,
  parseYouTubeVideoId,
} from "../modules/youtube/youtube.service.js";

describe("youtube parser", () => {
  it("extracts ids from supported formats", () => {
    expect(
      parseYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(
      parseYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
    expect(
      parseYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
  });
  it("parses durations", () => {
    expect(parseIsoDurationSeconds("PT1H2M3S")).toBe(3723);
  });
});
