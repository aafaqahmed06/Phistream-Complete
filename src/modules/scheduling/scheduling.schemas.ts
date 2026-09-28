import { z } from 'zod';

import { MEETING_STATUSES } from '../../db/schema/enums.js';

export const schedulingSessionResponseSchema = z
  .object({
    data: z.object({
      eligible: z.literal(true),
      schedulingUrl: z
        .string()
        .describe('Provider booking page for this applicant. Open it or embed it.'),
      expiresAt: z.date().describe('When this scheduling token stops working'),
    }),
  })
  .meta({ id: 'SchedulingSessionResponse' });

export const webhookParamsSchema = z.object({
  provider: z.string().regex(/^[a-z][a-z0-9_-]{0,49}$/),
});

export const webhookResponseSchema = z
  .object({ received: z.literal(true) })
  .meta({ id: 'SchedulingWebhookAck' });

export const schedulingAccessIssuedResponseSchema = z
  .object({
    data: z.object({
      token: z
        .string()
        .describe(
          'Scheduling token for the applicant, shown once and not stored. Send it to the applicant only.',
        ),
      expiresAt: z.date(),
      link: z
        .string()
        .nullable()
        .describe('SCHEDULING_PAGE_URL with the token in the URL fragment; null if not configured'),
    }),
  })
  .meta({ id: 'SchedulingAccessIssued' });

const booking = z.object({
  id: z.string(),
  startsAt: z.date(),
  endsAt: z.date(),
  meetingUrl: z.string().nullable(),
  status: z.enum(['SCHEDULED', 'CANCELLED']),
});

export const bookingLookupResponseSchema = z
  .object({
    data: z.object({
      meeting: z.object({
        id: z.uuid(),
        status: z.enum(MEETING_STATUSES),
        startsAt: z.date(),
        endsAt: z.date(),
        meetingUrl: z.string().nullable(),
      }),
      providerBooking: booking
        .nullable()
        .describe("The provider's live view (null if the provider no longer has it)"),
    }),
  })
  .meta({ id: 'BookingLookup' });
