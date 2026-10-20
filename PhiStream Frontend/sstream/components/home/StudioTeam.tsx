"use client";

import { useEffect, useRef } from "react";
import { studioSection } from "@/lib/content-home";

/** Derive initials from the first two words of a name. MW, AA, HK, AG, DM */
function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p.replace(/\.$/, "")[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * StudioTeam — #studio section (ink radial background).
 * §4.4 — client component for 3D-tilt cards.
 *
 * 3D tilt: CSS vars --rx / --ry / --in / --tz driven by pointermove.
 * No React state per mousemove — uses el.style.setProperty directly on refs.
 */
export function StudioTeam() {
  const d = studioSection;
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    // Reduced motion: skip tilt entirely
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const cleanups: (() => void)[] = [];

    cardRefs.current.forEach((el) => {
      if (!el) return;

      const onPointerMove = (e: PointerEvent) => {
        const rect = el.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;   // −.5 … .5
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        el.style.setProperty("--ry", `${x * 22}deg`);
        el.style.setProperty("--rx", `${-y * 18}deg`);
        el.classList.add("pf-hv");
      };

      const onPointerLeave = () => {
        el.style.setProperty("--ry", "0deg");
        el.style.setProperty("--rx", "0deg");
        el.classList.remove("pf-hv");
      };

      el.addEventListener("pointermove", onPointerMove);
      el.addEventListener("pointerleave", onPointerLeave);
      cleanups.push(() => {
        el.removeEventListener("pointermove", onPointerMove);
        el.removeEventListener("pointerleave", onPointerLeave);
      });
    });

    // IntersectionObserver for entrance animation
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const el = e.target as HTMLElement;
          if (e.isIntersecting) {
            el.classList.add("pf-on");
            obs.unobserve(el);
            // Reset delay after entrance so hover is snappy
            setTimeout(() => { el.style.transitionDelay = ""; }, 1200);
          }
        });
      },
      { threshold: 0.25 },
    );

    cardRefs.current.forEach((el, i) => {
      if (!el) return;
      el.style.transitionDelay = `${i * 90}ms`;
      obs.observe(el);
    });

    cleanups.push(() => obs.disconnect());
    return () => cleanups.forEach((fn) => fn());
  }, []);

  return (
    <section id="studio" className="pf-studio">
      <div className="pf-w2">
        <h2>{d.heading}</h2>
        <p className="pf-sub">{d.sub}</p>

        <div className="pf-team">
          {d.members.map((member, i) => (
            <div
              key={member.name}
              ref={(el) => { cardRefs.current[i] = el; }}
              className="pf-tc"
            >
              <div className="pf-pp">
                <span className="pf-initials" aria-hidden="true">
                  {initials(member.name)}
                </span>
              </div>
              <div className="pf-nm">
                <span className="pf-nm-name">{member.name}</span>
                <span className="pf-nm-role">{member.role}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
