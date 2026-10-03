/**
 * Email templates. Pure functions: data in, { subject, text, html } out.
 *
 * Rules:
 * - Every interpolated value is HTML-escaped; subjects are single-line.
 * - Only http(s) links are rendered.
 * - No secrets: the only credential that ever appears is the applicant's own
 *   scheduling link, sent to the applicant.
 * - Applicant emails never contain internal data (review notes, rejection
 *   reasons, answers). Staff emails link to the dashboard instead of copying
 *   application answers into inboxes.
 * - Copy states no business facts (prices, promises); the business can
 *   refine wording here without touching the dispatcher.
 */

export const BRAND_NAME = 'Phistream Studio';

/** Brand palette (CLAUDE.md). */
const COLORS = {
  dark: '#2B211A',
  light: '#F3EFE6',
  gold: '#C89B3C',
  muted: '#A69377',
} as const;

export const TEMPLATE_IDS = [
  'staff.contact_received',
  'staff.application_submitted',
  'applicant.application_accepted',
  'applicant.application_rejected',
  'applicant.meeting_booked',
  'staff.meeting_booked',
  'applicant.meeting_rescheduled',
  'staff.meeting_rescheduled',
  'applicant.meeting_cancelled',
  'staff.meeting_cancelled',
  'staff.scheduling_needs_attention',
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export interface RenderedEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

// ---- Helpers ------------------------------------------------------------------------

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Collapses whitespace/control characters so values cannot break the header. */
function subjectLine(value: string): string {
  return value
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** e.g. "Wednesday, 1 July 2026 at 15:00 UTC" (applicant time zones are unknown). */
export function formatWhen(date: Date): string {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
  return `${formatted} UTC`;
}

type Block =
  | { readonly kind: 'p'; readonly text: string }
  /** Multi-line user text shown verbatim (e.g. a contact message). */
  | { readonly kind: 'quote'; readonly text: string }
  | { readonly kind: 'details'; readonly rows: readonly (readonly [string, string | null])[] }
  | { readonly kind: 'button'; readonly label: string; readonly url: string | null };

const p = (text: string): Block => ({ kind: 'p', text });

function layout(input: {
  subject: string;
  heading: string;
  blocks: readonly Block[];
  audience: 'applicant' | 'staff';
}): RenderedEmail {
  const footer =
    input.audience === 'staff'
      ? `Internal notification from the ${BRAND_NAME} backend.`
      : `${BRAND_NAME}. You are receiving this because you contacted us or applied to work with us.`;

  const htmlBlocks = input.blocks.map((block) => {
    switch (block.kind) {
      case 'p':
        return `<p style="margin:0 0 16px">${escapeHtml(block.text)}</p>`;
      case 'quote':
        return `<div style="margin:0 0 16px;padding:12px 16px;border-left:3px solid ${COLORS.gold};background:#fff;white-space:pre-wrap">${escapeHtml(block.text)}</div>`;
      case 'details': {
        const rows = block.rows
          .filter(([, value]) => value !== null && value !== '')
          .map(
            ([label, value]) =>
              `<tr><td style="padding:4px 12px 4px 0;color:${COLORS.muted};vertical-align:top">${escapeHtml(label)}</td><td style="padding:4px 0">${escapeHtml(value ?? '')}</td></tr>`,
          )
          .join('');
        return `<table role="presentation" style="margin:0 0 16px;border-collapse:collapse">${rows}</table>`;
      }
      case 'button': {
        const url = safeUrl(block.url);
        return url
          ? `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;background:${COLORS.gold};color:${COLORS.dark};text-decoration:none;border-radius:4px;font-weight:bold">${escapeHtml(block.label)}</a></p>`
          : '';
      }
    }
  });

  const textBlocks = input.blocks.map((block) => {
    switch (block.kind) {
      case 'p':
        return block.text;
      case 'quote':
        return block.text
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n');
      case 'details':
        return block.rows
          .filter(([, value]) => value !== null && value !== '')
          .map(([label, value]) => `${label}: ${value ?? ''}`)
          .join('\n');
      case 'button': {
        const url = safeUrl(block.url);
        return url ? `${block.label}: ${url}` : '';
      }
    }
  });

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(input.subject)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.light};color:${COLORS.dark};font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5">
<table role="presentation" width="100%" style="border-collapse:collapse"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:600px;border-collapse:collapse">
<tr><td style="background:${COLORS.dark};color:${COLORS.light};padding:16px 24px;font-size:18px;font-weight:bold">${escapeHtml(BRAND_NAME)}</td></tr>
<tr><td style="background:${COLORS.light};padding:24px">
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(input.heading)}</h1>
${htmlBlocks.join('\n')}
</td></tr>
<tr><td style="padding:16px 24px;color:${COLORS.muted};font-size:12px">${escapeHtml(footer)}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    input.heading,
    '',
    ...textBlocks.filter((t) => t !== '').flatMap((t) => [t, '']),
    '--',
    footer,
  ].join('\n');

  return { subject: subjectLine(input.subject), text, html };
}

// ---- Templates ------------------------------------------------------------------------

export function staffContactReceived(data: {
  name: string;
  email: string;
  phone: string | null;
  companyName: string | null;
  message: string;
  source: string | null;
  campaign: string | null;
  receivedAt: Date;
}): RenderedEmail {
  return layout({
    audience: 'staff',
    subject: `New contact message from ${data.name}`,
    heading: 'New contact message',
    blocks: [
      {
        kind: 'details',
        rows: [
          ['Name', data.name],
          ['Email', data.email],
          ['Phone', data.phone],
          ['Company', data.companyName],
          ['Source', data.source],
          ['Campaign', data.campaign],
          ['Received', formatWhen(data.receivedAt)],
        ],
      },
      { kind: 'quote', text: data.message },
      p('Replying to this email replies to the sender.'),
    ],
  });
}

export function staffApplicationSubmitted(data: {
  reference: string;
  applicantName: string;
  applicantEmail: string;
  serviceTierName: string | null;
  source: string | null;
  submittedAt: Date;
  adminUrl: string | null;
}): RenderedEmail {
  return layout({
    audience: 'staff',
    subject: `New application ${data.reference} from ${data.applicantName}`,
    heading: 'New eligibility application',
    blocks: [
      {
        kind: 'details',
        rows: [
          ['Reference', data.reference],
          ['Applicant', data.applicantName],
          ['Email', data.applicantEmail],
          ['Service', data.serviceTierName],
          ['Source', data.source],
          ['Submitted', formatWhen(data.submittedAt)],
        ],
      },
      p('The answers are available in the admin dashboard (not copied into email).'),
      { kind: 'button', label: 'Review application', url: data.adminUrl },
    ],
  });
}

export function applicantApplicationAccepted(data: {
  name: string;
  reference: string;
  schedulingLink: string | null;
  linkExpiresAt: Date | null;
}): RenderedEmail {
  const blocks: Block[] = [
    p(`Hi ${data.name},`),
    p(
      `Thank you for applying to ${BRAND_NAME}. We have reviewed your application (${data.reference}) and would like to arrange a call with you.`,
    ),
  ];
  if (data.schedulingLink) {
    blocks.push(
      p(
        'Please choose a time that suits you using the button below. The link is personal: please do not share it.',
      ),
      { kind: 'button', label: 'Book your call', url: data.schedulingLink },
    );
    if (data.linkExpiresAt) {
      blocks.push(
        p(
          `The link is valid until ${formatWhen(data.linkExpiresAt)}. If it expires, reply to this email and we will send a new one.`,
        ),
      );
    }
  } else {
    blocks.push(p('We will be in touch shortly to arrange a time.'));
  }
  return layout({
    audience: 'applicant',
    subject: `Your ${BRAND_NAME} application: next steps`,
    heading: 'Good news about your application',
    blocks,
  });
}

export function applicantApplicationRejected(data: {
  name: string;
  reference: string;
}): RenderedEmail {
  return layout({
    audience: 'applicant',
    subject: `Your ${BRAND_NAME} application`,
    heading: 'An update on your application',
    blocks: [
      p(`Hi ${data.name},`),
      p(
        `Thank you for applying to ${BRAND_NAME} and for the time you took to tell us about your work (reference ${data.reference}).`,
      ),
      p(
        'After careful review, we are not able to move forward with your application at this time.',
      ),
      p('We appreciate your interest and wish you every success.'),
    ],
  });
}

export type MeetingChange = 'booked' | 'rescheduled' | 'cancelled';

interface MeetingData {
  readonly change: MeetingChange;
  readonly reference: string;
  readonly applicantName: string;
  readonly applicantEmail: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly meetingUrl: string | null;
}

const MEETING_COPY: Record<MeetingChange, { applicant: string; staff: string }> = {
  booked: { applicant: 'Your call is booked', staff: 'Call booked' },
  rescheduled: { applicant: 'Your call has been rescheduled', staff: 'Call rescheduled' },
  cancelled: { applicant: 'Your call has been cancelled', staff: 'Call cancelled' },
};

export function applicantMeeting(data: MeetingData): RenderedEmail {
  const heading = MEETING_COPY[data.change].applicant;
  const when = formatWhen(data.startsAt);
  const blocks: Block[] = [p(`Hi ${data.applicantName},`)];
  if (data.change === 'cancelled') {
    blocks.push(
      p(`Your call scheduled for ${when} has been cancelled.`),
      p(
        'If you would still like to talk, you can book a new time with your scheduling link while it is valid, or reply to this email.',
      ),
    );
  } else {
    blocks.push(
      {
        kind: 'details',
        rows: [
          ['When', when],
          ['Reference', data.reference],
        ],
      },
      { kind: 'button', label: 'Join the call', url: data.meetingUrl },
      p(
        'Your booking confirmation from our scheduling provider contains options to reschedule or cancel.',
      ),
    );
  }
  return layout({ audience: 'applicant', subject: `${heading}: ${when}`, heading, blocks });
}

export function staffMeeting(data: MeetingData & { adminUrl: string | null }): RenderedEmail {
  const heading = MEETING_COPY[data.change].staff;
  return layout({
    audience: 'staff',
    subject: `${heading}: ${data.reference} (${data.applicantName})`,
    heading,
    blocks: [
      {
        kind: 'details',
        rows: [
          ['Reference', data.reference],
          ['Applicant', data.applicantName],
          ['Email', data.applicantEmail],
          ['When', formatWhen(data.startsAt)],
          ['Ends', formatWhen(data.endsAt)],
          ['Meeting link', data.change === 'cancelled' ? null : safeUrl(data.meetingUrl)],
        ],
      },
      { kind: 'button', label: 'Open application', url: data.adminUrl },
    ],
  });
}

export function staffSchedulingNeedsAttention(data: {
  outcome: string;
  provider: string;
  providerEventType: string;
  bookingId: string | null;
  reference: string | null;
  receivedAt: Date;
  adminUrl: string | null;
}): RenderedEmail {
  const explanation =
    data.outcome === 'NOT_ELIGIBLE'
      ? 'A booking was made for an application that is not (or no longer) allowed to schedule. It was not linked. Please cancel it with the scheduling provider if appropriate.'
      : 'A booking arrived that could not be linked to any application (no valid scheduling link was used). It was not linked. Please review and cancel it with the scheduling provider if appropriate.';
  return layout({
    audience: 'staff',
    subject: `Scheduling: booking needs attention (${data.outcome})`,
    heading: 'A booking needs attention',
    blocks: [
      p(explanation),
      {
        kind: 'details',
        rows: [
          ['Outcome', data.outcome],
          ['Provider', data.provider],
          ['Provider event', data.providerEventType],
          ['Booking id', data.bookingId],
          ['Application', data.reference],
          ['Received', formatWhen(data.receivedAt)],
        ],
      },
      { kind: 'button', label: 'Open application', url: data.adminUrl },
    ],
  });
}
