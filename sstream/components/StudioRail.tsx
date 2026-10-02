"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { studio } from "@/lib/content";
import { Reveal } from "./motion/Reveal";
import { Eyebrow } from "./ui/Eyebrow";

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("");
}

/**
 * Horizontal rail.
 *
 * Native overflow scrolling rather than a JS drag transform: trackpad, touch,
 * shift+wheel and keyboard arrow keys all work for free, and there is no
 * library fighting the compositor. The pointer handler only adds mouse-drag for
 * people without a trackpad, and it is gated to pointerType === "mouse" so it
 * never interferes with native touch scrolling.
 *
 * The card tilts a degree on hover, the way you would pick a print up off a
 * stack. It is one transform, it is on the figure rather than the frame, and it
 * is the only place in the rail that moves.
 */
export function StudioRail() {
  const railRef = useRef<HTMLUListElement>(null);
  const drag = useRef({ active: false, startX: 0, startLeft: 0 });

  const onPointerDown = (e: ReactPointerEvent<HTMLUListElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = railRef.current;
    if (!el) return;
    drag.current = { active: true, startX: e.clientX, startLeft: el.scrollLeft };
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLUListElement>) => {
    const el = railRef.current;
    if (!el || !drag.current.active) return;
    el.scrollLeft = drag.current.startLeft - (e.clientX - drag.current.startX);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLUListElement>) => {
    const el = railRef.current;
    drag.current.active = false;
    if (el?.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <section id="studio" className="surface-ink section-y overflow-hidden">
      <div className="container-x">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <div className="max-w-[46ch]">
            <Reveal y={16}>
              <Eyebrow tone="on-ink">{studio.eyebrow}</Eyebrow>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mt-6 font-display text-display-l text-cream">
                {studio.heading}
              </h2>
            </Reveal>
            <Reveal delay={0.14}>
              <p className="mt-6 text-body text-cream/80">{studio.lead}</p>
            </Reveal>
          </div>
        </div>
      </div>

      <ul
        ref={railRef}
        tabIndex={0}
        aria-label="Studio team — scroll horizontally"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="no-scrollbar mt-14 flex snap-x snap-mandatory gap-6 overflow-x-auto px-[clamp(1.25rem,4vw,4rem)] pb-4 cursor-grab active:cursor-grabbing"
      >
        {studio.members.map((member) => (
          <li
            key={member.name}
            className="w-[76vw] shrink-0 snap-start sm:w-[19rem] lg:w-[21rem]"
          >
            <figure className="group">
              <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-taupe/20 bg-ink transition-[border-color,transform] duration-500 ease-expo-out group-hover:-rotate-1 group-hover:border-gold/40">
                {/*
                  Placeholder art: a gold wash plus the member's initials.
                  Drop real portraiture in here as <Image fill sizes="21rem" />
                  when it exists -- the aspect ratio and rounding are ready.
                */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(200,155,60,0.24),transparent_60%)] opacity-60 transition-opacity duration-500 group-hover:opacity-100"
                />
                <span
                  aria-hidden="true"
                  className="bleed-glyph wonk left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[7rem] text-gold opacity-[0.12]"
                >
                  {initials(member.name)}
                </span>
              </div>
              <figcaption className="mt-5">
                <div className="font-display text-heading text-cream">
                  {member.name}
                </div>
                <div className="mt-1 text-small text-taupe">{member.role}</div>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
