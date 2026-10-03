import { describe, expect, it } from 'vitest';

import {
  applicantApplicationAccepted,
  applicantApplicationRejected,
  applicantMeeting,
  escapeHtml,
  formatWhen,
  staffApplicationSubmitted,
  staffContactReceived,
  staffMeeting,
  staffSchedulingNeedsAttention,
  type RenderedEmail,
} from '../../src/modules/notifications/templates.js';

const EVIL = '<script>alert(1)</script>"&\'';
const WHEN = new Date('2026-07-01T15:00:00Z');

function expectEscaped(email: RenderedEmail) {
  expect(email.html).not.toContain('<script>');
  expect(email.html).toContain('&lt;script&gt;');
}

const meeting = {
  reference: 'PHI-2026-ABC123',
  applicantName: 'Jane Doe',
  applicantEmail: 'jane@example.com',
  startsAt: WHEN,
  endsAt: new Date('2026-07-01T15:30:00Z'),
  meetingUrl: 'https://meet.example.com/abc',
};

describe('email templates', () => {
  it('formats times explicitly in UTC', () => {
    // Exact punctuation varies by ICU version; the parts that matter do not.
    expect(formatWhen(WHEN)).toMatch(/^Wednesday,? 1 July 2026 at 15:00 UTC$/);
  });

  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  describe('contact received → staff', () => {
    const email = staffContactReceived({
      name: EVIL,
      email: 'sender@example.com',
      phone: null,
      companyName: 'Acme',
      message: `Line one\nLine two ${EVIL}`,
      source: 'instagram',
      campaign: null,
      receivedAt: WHEN,
    });

    it('includes the message and details, escaped', () => {
      expectEscaped(email);
      expect(email.text).toContain('> Line one\n> Line two');
      expect(email.text).toContain('Company: Acme');
      expect(email.text).not.toContain('Phone:'); // empty rows are omitted
    });

    it('keeps the subject on one line', () => {
      const multiline = staffContactReceived({
        name: 'Jane\r\nBcc: victim@example.com',
        email: 'x@example.com',
        phone: null,
        companyName: null,
        message: 'm',
        source: null,
        campaign: null,
        receivedAt: WHEN,
      });
      expect(multiline.subject).toBe('New contact message from Jane Bcc: victim@example.com');
      expect(multiline.subject).not.toMatch(/[\r\n]/);
    });
  });

  it('new application → staff links to the dashboard instead of copying answers', () => {
    const email = staffApplicationSubmitted({
      reference: 'PHI-2026-ABC123',
      applicantName: EVIL,
      applicantEmail: 'jane@example.com',
      serviceTierName: 'Growth',
      source: null,
      submittedAt: WHEN,
      adminUrl: 'https://admin.example.com/applications/1',
    });
    expectEscaped(email);
    expect(email.subject).toContain('PHI-2026-ABC123');
    expect(email.html).toContain('href="https://admin.example.com/applications/1"');
    expect(email.text).toContain('not copied into email');
  });

  describe('accepted → applicant', () => {
    it('includes the personal scheduling link and its expiry', () => {
      const email = applicantApplicationAccepted({
        name: 'Jane',
        reference: 'PHI-2026-ABC123',
        schedulingLink: 'https://phistream.example/schedule#token=abc',
        linkExpiresAt: WHEN,
      });
      expect(email.html).toContain('href="https://phistream.example/schedule#token=abc"');
      expect(email.text).toContain('Book your call: https://phistream.example/schedule#token=abc');
      expect(email.text).toContain(formatWhen(WHEN));
    });

    it('works without a link', () => {
      const email = applicantApplicationAccepted({
        name: 'Jane',
        reference: 'R',
        schedulingLink: null,
        linkExpiresAt: null,
      });
      expect(email.text).toContain('We will be in touch shortly');
      expect(email.html).not.toContain('<a ');
    });

    it('never renders non-http links', () => {
      const email = applicantApplicationAccepted({
        name: 'Jane',
        reference: 'R',
        schedulingLink: 'javascript:alert(1)',
        linkExpiresAt: null,
      });
      expect(email.html).not.toContain('javascript:');
      expect(email.text).not.toContain('javascript:');
    });
  });

  it('rejected → applicant is polite and has no reason field', () => {
    const email = applicantApplicationRejected({ name: EVIL, reference: 'PHI-2026-ABC123' });
    expectEscaped(email);
    expect(email.text).toContain('not able to move forward');
    expect(email.text.toLowerCase()).not.toContain('reason');
  });

  describe('meeting emails', () => {
    it.each(['booked', 'rescheduled'] as const)(
      '%s → applicant includes time and join link',
      (change) => {
        const email = applicantMeeting({ ...meeting, change });
        expect(email.subject).toContain(formatWhen(WHEN));
        expect(email.html).toContain('href="https://meet.example.com/abc"');
      },
    );

    it('cancelled → applicant has no join link', () => {
      const email = applicantMeeting({ ...meeting, change: 'cancelled' });
      expect(email.subject).toContain('cancelled');
      expect(email.html).not.toContain('meet.example.com');
    });

    it('booked → staff includes applicant details and the dashboard link', () => {
      const email = staffMeeting({
        ...meeting,
        change: 'booked',
        adminUrl: 'https://admin.example.com/applications/1',
      });
      expect(email.text).toContain('Email: jane@example.com');
      expect(email.text).toContain('Meeting link: https://meet.example.com/abc');
      expect(email.subject).toContain('PHI-2026-ABC123');
    });
  });

  it('scheduling needs attention → staff explains the outcome', () => {
    const email = staffSchedulingNeedsAttention({
      outcome: 'NOT_ELIGIBLE',
      provider: 'calcom',
      providerEventType: 'BOOKING_CREATED',
      bookingId: 'uid-1',
      reference: null,
      receivedAt: WHEN,
      adminUrl: null,
    });
    expect(email.text).toContain('not (or no longer) allowed to schedule');
    expect(email.text).toContain('Booking id: uid-1');
  });

  it('produces a complete HTML document and a plain-text part for every template', () => {
    const all = [
      applicantApplicationRejected({ name: 'A', reference: 'R' }),
      applicantMeeting({ ...meeting, change: 'booked' }),
      staffMeeting({ ...meeting, change: 'cancelled', adminUrl: null }),
    ];
    for (const email of all) {
      expect(email.html.startsWith('<!doctype html>')).toBe(true);
      expect(email.html).toContain('Phistream Studio');
      expect(email.text.length).toBeGreaterThan(20);
      expect(email.subject.length).toBeLessThanOrEqual(200);
    }
  });
});
