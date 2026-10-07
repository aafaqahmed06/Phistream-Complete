"use client";

import { useEffect, useRef, useState } from "react";
import { track, type FunnelEvent } from "@/lib/analytics";
import type { VideoSource } from "@/lib/video";

/**
 * The onboarding video (see lib/video.ts for which sources play how). An
 * embedded player sits behind a play button so nothing third-party loads
 * until the visitor asks for it, and the click is the vsl_start event.
 */

const QUARTILES: [number, FunnelEvent][] = [
  [0.25, "vsl_25"],
  [0.5, "vsl_50"],
  [0.75, "vsl_75"],
];

export function Vsl({ source, label }: { source: VideoSource; label: string }) {
  const [playing, setPlaying] = useState(false);
  const sent = useRef(new Set<FunnelEvent>());

  const once = (event: FunnelEvent) => {
    if (sent.current.has(event)) return;
    sent.current.add(event);
    track(event);
  };

  const frame = "aspect-video w-full overflow-hidden rounded-3xl bg-cream/5 ring-1 ring-taupe/40";

  if (source.kind === "file") {
    return (
      <video
        className={frame}
        src={source.src}
        controls
        playsInline
        preload="metadata"
        onPlay={() => once("vsl_start")}
        onEnded={() => once("vsl_complete")}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (!v.duration) return;
          for (const [at, event] of QUARTILES) {
            if (v.currentTime / v.duration >= at) once(event);
          }
        }}
      />
    );
  }

  if (playing) {
    return (
      <iframe
        className={frame}
        src={source.src}
        title={label}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        once("vsl_start");
        setPlaying(true);
      }}
      className={`${frame} group flex items-center justify-center`}
    >
      <span className="inline-flex items-center gap-3 rounded-full bg-gold px-6 py-3 text-small font-medium text-ink transition-colors group-hover:bg-cream">
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
          <path d="M4 2.5v11l9-5.5z" />
        </svg>
        {label}
      </span>
    </button>
  );
}

/** Reports one funnel event when the page is first shown. */
export function TrackOnView({ event }: { event: FunnelEvent }) {
  useEffect(() => {
    track(event);
  }, [event]);
  return null;
}
