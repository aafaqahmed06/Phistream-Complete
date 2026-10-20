/**
 * The six service cards' copy and colours. Kept apart from the 3D engine (which
 * imports `three`) so the static card strip, a server component, can use it
 * without pulling the engine in.
 */
export type CardSpec = {
  n: string;
  title: string;
  /** One line: what the client gets. */
  line: string;
  /** Three deliverables, drawn as chips. */
  tags: [string, string, string];
  bg: string;
  fg: string;
};

/** Order, titles and colours follow the preview's `L` array; line/tags are the card-face copy. */
export const CARD_SPECS: CardSpec[] = [
  { n: "01", title: "Identity & Positioning", line: "Who you are, in one sentence.",
    tags: ["Positioning", "Brand voice", "Messaging"], bg: "#1A315B", fg: "#ECE9DF" },
  { n: "02", title: "Audience & Funnel", line: "From a stranger's attention to a paying customer.",
    tags: ["Funnel map", "Cadence", "Formats"], bg: "#964C37", fg: "#ECE9DF" },
  { n: "03", title: "Monetization", line: "Revenue that compounds, not resets.",
    tags: ["Offers", "Pricing", "Products"], bg: "#A69376", fg: "#2A201A" },
  { n: "04", title: "Content & Format", line: "The team behind the actual uploads.",
    tags: ["On-camera", "Production", "Formats"], bg: "#1A315B", fg: "#ECE9DF" },
  { n: "05", title: "Operations", line: "The engine that keeps the business running.",
    tags: ["Contracts", "Pipeline", "Reporting"], bg: "#964C37", fg: "#ECE9DF" },
  { n: "06", title: "Scaling", line: "More revenue per view, per follower, per deal.",
    tags: ["Growth plan", "Per follower", "Per deal"], bg: "#A69376", fg: "#2A201A" },
];
