export function loadYouTubeApi() {
  if (window.YT?.Player)
    return Promise.resolve(window.YT as NonNullable<typeof window.YT>);
  return new Promise<typeof window.YT>((resolve) => {
    window.onYouTubeIframeAPIReady = () =>
      resolve(window.YT as NonNullable<typeof window.YT>);
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
}
