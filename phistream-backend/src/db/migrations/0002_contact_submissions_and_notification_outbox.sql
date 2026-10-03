CREATE TABLE "contact_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"company_name" text,
	"message" text NOT NULL,
	"source" text,
	"campaign" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_submissions_full_name_length" CHECK (char_length("contact_submissions"."full_name") between 1 and 200),
	CONSTRAINT "contact_submissions_phone_length" CHECK (char_length("contact_submissions"."phone") between 1 and 50),
	CONSTRAINT "contact_submissions_company_name_length" CHECK (char_length("contact_submissions"."company_name") between 1 and 200),
	CONSTRAINT "contact_submissions_message_length" CHECK (char_length("contact_submissions"."message") between 1 and 5000),
	CONSTRAINT "contact_submissions_source_length" CHECK (char_length("contact_submissions"."source") between 1 and 100),
	CONSTRAINT "contact_submissions_campaign_length" CHECK (char_length("contact_submissions"."campaign") between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "contact_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_events_status_valid" CHECK ("notification_events"."status" in ('PENDING', 'PROCESSED', 'FAILED')),
	CONSTRAINT "notification_events_event_type_format" CHECK ("notification_events"."event_type" ~ '^[A-Z][A-Z0-9_]*$'),
	CONSTRAINT "notification_events_subject_type_format" CHECK ("notification_events"."subject_type" ~ '^[a-z][a-z0-9_]*$'),
	CONSTRAINT "notification_events_attempts_non_negative" CHECK ("notification_events"."attempts" >= 0),
	CONSTRAINT "notification_events_last_error_length" CHECK (char_length("notification_events"."last_error") between 1 and 2000),
	CONSTRAINT "notification_events_processed_at_when_processed" CHECK ("notification_events"."status" <> 'PROCESSED' or "notification_events"."processed_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "notification_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD CONSTRAINT "contact_submissions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_submissions_lead_id_created_at_idx" ON "contact_submissions" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "contact_submissions_created_at_idx" ON "contact_submissions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_events_subject_key" ON "notification_events" USING btree ("event_type","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "notification_events_status_created_at_idx" ON "notification_events" USING btree ("status","created_at");