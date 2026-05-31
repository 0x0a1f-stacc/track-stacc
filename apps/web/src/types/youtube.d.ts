export {};

declare global {
  interface Window {
    YT?: {
      Player: new (elementId: string, options: YT.PlayerOptions) => YT.Player;
      PlayerState: { ENDED: number; BUFFERING: number; PLAYING: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
  namespace YT {
    interface PlayerOptions {
      videoId?: string;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: () => void;
      };
    }
    interface Player {
      loadVideoById(options: { videoId: string; startSeconds?: number }): void;
      seekTo(seconds: number, allowSeekAhead: boolean): void;
      getCurrentTime(): number;
      playVideo(): void;
      destroy(): void;
    }
  }
}
