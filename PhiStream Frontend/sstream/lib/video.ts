/**
 * Where the onboarding video can be played from:
 *
 *   - A video file (.mp4/.webm/…): a native <video>, so the funnel gets every
 *     stage -- start, 25/50/75% and complete.
 *   - YouTube, Vimeo or Loom: their embed player. Only the start is reported;
 *     progress inside a third-party iframe needs that provider's player API.
 *
 * Anything else is null, and the page leaves the video out rather than
 * showing a broken frame.
 */
export type VideoSource = { kind: "file"; src: string } | { kind: "embed"; src: string };

export function videoSource(url: string | null | undefined): VideoSource | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (/\.(mp4|webm|ogg|mov|m4v)$/i.test(u.pathname)) return { kind: "file", src: url };

  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtu.be" || host.endsWith("youtube.com")) {
    const id =
      host === "youtu.be"
        ? u.pathname.slice(1)
        : (u.searchParams.get("v") ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1]);
    return id
      ? {
          kind: "embed",
          src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`,
        }
      : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = u.pathname.match(/(\d+)/)?.[1];
    return id ? { kind: "embed", src: `https://player.vimeo.com/video/${id}?autoplay=1` } : null;
  }
  if (host === "loom.com") {
    const id = u.pathname.match(/^\/(?:share|embed)\/([^/]+)/)?.[1];
    return id
      ? { kind: "embed", src: `https://www.loom.com/embed/${encodeURIComponent(id)}?autoplay=1` }
      : null;
  }
  return null;
}
