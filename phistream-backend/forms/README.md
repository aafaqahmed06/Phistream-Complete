# Eligibility form: `eligibility-2026-10.json`

The questions behind `/apply`. Published as data, never hard-coded:

```bash
npm run forms:publish -- 2026-10 forms/eligibility-2026-10.json
```

This validates the file with the API's own schema, retires the current ACTIVE
version (the `[DEMO]` form, `demo-v1`) and makes this one ACTIVE, in one
transaction. A published version is immutable: to change a question, copy the
file, edit it and publish it under a new version name.

The applicant's name, email, phone, company and chosen way of working are
collected by the page itself, so they are not repeated here.

## What the form is for

Staff read every application in `/admin` and accept or reject it. Nothing here
scores automatically; the form is built so a reviewer can decide in a couple of
minutes. Each question traces to the studio's own documents:

| Question(s)                                                         | What it tests                                                                                                                          | Source                                                                |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `track`, `main_link`, `building`                                    | Which track they are on, and whether the problem is one we solve ("a following that doesn't pay yet, or a business nobody's heard of") | Homepage Copy: hero paths, contact section                            |
| `market`                                                            | Whether they are billed in USD or PKR                                                                                                  | Offers & Pricing: two markets                                         |
| `monthly_revenue`, `time_in_market`, `revenue_sources`              | Whether there is something to build on: attention or a business already exists                                                         | Hero: "You already have the attention / the business"                 |
| `owned_assets`                                                      | Whether they own anything off-platform (list, offer, site, pipeline)                                                                   | How we work: "Own the infrastructure"                                 |
| `creator_platform`, `creator_audience_size`, `creator_deal_mandate` | Creator fit; willingness to be represented on deals (retainer plus 15-20% commission)                                                  | Offers & Pricing: Creator Tiers 1-3; work example A                   |
| `founder_acquisition`, `founder_team_size`, `founder_on_camera`     | Founder fit; whether a team can run a content system; willingness to be on camera                                                      | Homepage Copy: work example B, "the founder who won't go on camera"   |
| `needs`                                                             | Which of the six disciplines; max three, so the scope stays focused                                                                    | How we work: "One system, properly built"                             |
| `success_metric`                                                    | Whether they think in numbers that pay, not views                                                                                      | How we work: "Measure what pays"                                      |
| `past_help`                                                         | Prior agency experience, and what went wrong                                                                                           | Reviewer context                                                      |
| `weekly_time`, `decision_maker`                                     | Can they actually give the time, and can they say yes                                                                                  | How we work: "Direction before tactics"                               |
| `budget_fit`                                                        | Budget against the published "From" prices                                                                                             | Offers & Pricing: tier floors                                         |
| `term_commitment`                                                   | Three-month minimum on retainers                                                                                                       | Offers & Pricing: Creator Operator, Founder Scale                     |
| `start_timeline`                                                    | Urgency and capacity planning                                                                                                          | Reviewer context                                                      |
| `discovery_call_ack`, `contact_consent`                             | Understands the discovery-call gate; consents to contact                                                                               | Offers & Pricing: "every engagement is gated behind a discovery call" |

Track-specific questions (`creator_*`, `founder_*`) are optional because the
form has no conditional logic; each is labelled "Creators:" or "Founders:".

## Suggested review guide

**Strong fit:** a real asset exists (audience or business); `owned_assets`
includes more than "none"; `success_metric` names a number; `budget_fit` is
`retainer_or_build` or `consultation` and matches the tier they chose;
`term_commitment` is `yes` for retainer tiers; `weekly_time` is 3 hours or more
(1-2 is workable for a founder with a team); `decision_maker` is `yes`.

**Look closer:** `budget_fit` or `term_commitment` is `unsure`; `weekly_time` is
`under_1`; `decision_maker` is `shared`; `success_metric` is about views or
followers only; `past_help` describes a falling-out.

**Usually not yet:** `budget_fit` is `below_range`; `decision_maker` is `no`;
a retainer tier is chosen but `term_commitment` is `one_off_only`; a founder
who answered `unwilling` on camera but wants the Scale tier (the content
system needs them); nothing to build on (`monthly_revenue` 0, no audience, no
business, `owned_assets` is `none`) and the Represented tier is chosen.

These are prompts for a human reviewer, not rules. The studio decides.

## Open items this form depends on

- **Currency in `budget_fit`.** The description quotes the published floors in
  USD and PKR (about PKR 280 to the dollar). Confirm the live rate, and publish
  a new form version if prices change.
- **Three-month minimum** (`term_commitment`) follows the Offers & Pricing doc,
  which still lists the minimum term as an open question (3 to 6 months).
