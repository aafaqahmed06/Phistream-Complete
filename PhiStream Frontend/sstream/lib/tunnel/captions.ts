import { INTRO_END, OUTRO_START, serviceCoord } from "./timeline";

/** 0 = intro, 10..15 = service k (the card nearest the front), 3 = closing. */
export function stageFor(p: number): number {
  if (p < INTRO_END) return 0;
  if (p >= OUTRO_START) return 3;
  return 10 + Math.min(5, Math.floor(serviceCoord(p)));
}

export const hintVisible = (p: number) => p < 0.04;
