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
  ac: string;
};

/** Order, titles and colours follow the preview's `L` array; line/tags are the card-face copy. */
export const CARD_SPECS: CardSpec[] = [
  { n: "01", title: "Identity & Positioning", line: "Who you are, in one sentence.",
    tags: ["Positioning", "Brand voice", "Messaging"], bg: "#14213D", fg: "#F4EDE0", ac: "#E9B44C" },
  { n: "02", title: "Audience & Funnel", line: "From a stranger's attention to a paying customer.",
    tags: ["Funnel map", "Cadence", "Formats"], bg: "#193052", fg: "#F4EDE0", ac: "#FF6B5B" },
  { n: "03", title: "Monetization", line: "Revenue that compounds, not resets.",
    tags: ["Offers", "Pricing", "Products"], bg: "#1D3858", fg: "#F4EDE0", ac: "#2A9D8F" },
  { n: "04", title: "Content & Format", line: "The team behind the actual uploads.",
    tags: ["On-camera", "Production", "Formats"], bg: "#21425A", fg: "#F4EDE0", ac: "#E9B44C" },
  { n: "05", title: "Operations", line: "The engine that keeps the business running.",
    tags: ["Contracts", "Pipeline", "Reporting"], bg: "#1D4B52", fg: "#F4EDE0", ac: "#FF6B5B" },
  { n: "06", title: "Scaling", line: "More revenue per view, per follower, per deal.",
    tags: ["Growth plan", "Per follower", "Per deal"], bg: "#24485A", fg: "#F4EDE0", ac: "#2A9D8F" },
];
