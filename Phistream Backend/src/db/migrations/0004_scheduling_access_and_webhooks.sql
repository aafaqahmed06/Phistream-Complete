CREATE TABLE "scheduling_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"outcome" text,
	"booking_id" text,
	"application_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "scheduling_webhook_events_provider_format" CHECK ("scheduling_webhook_events"."provider" ~ '^[a-z][a-z0-9_-]*$'),
	CONSTRAINT "scheduling_webhook_events_outcome_valid" CHECK ("scheduling_webhook_events"."outcome" is null or "scheduling_webhook_events"."outcome" in ('PROCESSED', 'IGNORED', 'UNMATCHED', 'NOT_ELIGIBLE')),
	CONSTRAINT "scheduling_webhook_events_provider_event_id_length" CHECK (char_length("scheduling_webhook_events"."provider_event_id") between 1 and 200),
	CONSTRAINT "scheduling_webhook_events_event_type_length" CHECK (char_length("scheduling_webhook_events"."event_type") between 1 and 100),
	CONSTRAINT "scheduling_webhook_events_booking_id_length" CHECK (char_length("scheduling_webhook_events"."booking_id") between 1 and 200),
	CONSTRAINT "scheduling_webhook_events_processed_with_outcome" CHECK (("scheduling_webhook_events"."processed_at" is null) = ("scheduling_webhook_events"."outcome" is null))
);
--> statement-breakpoint
ALTER TABLE "scheduling_webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scheduling_sessions" ADD COLUMN "booking_ref_hash" text;--> statement-breakpoint
ALTER TABLE "scheduling_webhook_events" ADD CONSTRAINT "scheduling_webhook_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scheduling_webhook_events_provider_event_key" ON "scheduling_webhook_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "scheduling_webhook_events_application_id_idx" ON "scheduling_webhook_events" USING btree ("application_id") WHERE application_id is not null;--> statement-breakpoint
CREATE INDEX "scheduling_webhook_events_received_at_idx" ON "scheduling_webhook_events" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduling_sessions_booking_ref_hash_key" ON "scheduling_sessions" USING btree ("booking_ref_hash") WHERE booking_ref_hash is not null;--> statement-breakpoint
ALTER TABLE "scheduling_sessions" ADD CONSTRAINT "scheduling_sessions_booking_ref_hash_format" CHECK ("scheduling_sessions"."booking_ref_hash" is null or "scheduling_sessions"."booking_ref_hash" ~ '^[0-9a-f]{64}$');