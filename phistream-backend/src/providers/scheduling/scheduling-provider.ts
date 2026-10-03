/**
 * Scheduling provider port (BUILD_PLAN Phase 6). The scheduling domain
 * (src/modules/scheduling) depends only on this file; adapters (Cal.com,
 * mock) live next to it and are selected in the composition root. The
 * provider owns calendars and availability. We own who may book and what a
 * booking means for an application.
 */

export interface SchedulingAttendee {
  readonly name: string;
  readonly email: string;
}

export interface CreateSchedulingAccessInput {
  /** Our scheduling session id: stable key for any provider-side per-applicant resource. */
  readonly sessionId: string;
  /**
   * Opaque reference the provider must echo back in booking webhooks, so the
   * booking can be linked to the application. Not an access credential.
   */
  readonly bookingRef: string;
  /** For prefilling the booking form. */
  readonly attendee: SchedulingAttendee;
}

export interface SchedulingAccess {
  /** Where the applicant books. Returned only to a valid access-token holder. */
  readonly schedulingUrl: string;
}

export interface RevokeSchedulingAccessInput {
  /** The session whose previous access was replaced or ended. */
  readonly sessionId: string;
}

/** A booking as the domain understands it, whatever the provider. */
export interface ProviderBooking {
  /** The provider's stable booking id (e.g. Cal.com booking uid). */
  readonly id: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** https video/meeting link, if the provider supplied one. */
  readonly meetingUrl: string | null;
  readonly status: 'SCHEDULED' | 'CANCELLED';
}

export type BookingEvent =
  | {
      readonly kind: 'BOOKING_CREATED';
      readonly booking: ProviderBooking;
      readonly bookingRef: string | null;
    }
  | {
      readonly kind: 'BOOKING_RESCHEDULED';
      /** The new booking. */
      readonly booking: ProviderBooking;
      /** The booking it replaces, when the provider says so. */
      readonly previousBookingId: string | null;
      readonly bookingRef: string | null;
    }
  | { readonly kind: 'BOOKING_CANCELLED'; readonly bookingId: string }
  /** Verified, but not an event the domain acts on (pings, other types). */
  | { readonly kind: 'IGNORED' };

export interface WebhookRequest {
  /** Lower-cased header names. */
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  /** The exact bytes received: signatures are computed over these. */
  readonly rawBody: Buffer;
}

export interface VerifiedWebhook {
  /** Unique per delivery-worthy event; used for deduplication. */
  readonly eventId: string;
  /** The provider's own event type name, for records and logs. */
  readonly eventType: string;
  readonly event: BookingEvent;
}

/** Signature missing or wrong: the request did not come from the provider. */
export class WebhookVerificationError extends Error {
  constructor(message = 'webhook signature verification failed') {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

/** Correctly signed, but the payload is not what the adapter understands. */
export class WebhookPayloadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'WebhookPayloadError';
  }
}

/** The provider API could not be reached or answered unexpectedly. */
export class SchedulingProviderUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SchedulingProviderUnavailableError';
  }
}

export interface SchedulingProvider {
  /** Lowercase slug stored with sessions/meetings and used in the webhook URL. */
  readonly name: string;
  createSchedulingAccess(input: CreateSchedulingAccessInput): Promise<SchedulingAccess>;
  /** Invalidate provider-side access for a reference (no-op if the provider has none). */
  revokeSchedulingAccess(input: RevokeSchedulingAccessInput): Promise<void>;
  /** Current state at the provider; null when the booking does not exist. */
  getBooking(input: { bookingId: string }): Promise<ProviderBooking | null>;
  /**
   * Verifies authenticity (signature over the raw body) BEFORE parsing, then
   * maps the payload to a BookingEvent. Throws WebhookVerificationError or
   * WebhookPayloadError.
   */
  verifyWebhook(request: WebhookRequest): Promise<VerifiedWebhook>;
}
