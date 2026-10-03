-- notification_deliveries had no writer before this phase (the dispatcher is new),
-- so the NOT NULL columns below are added to an empty table.
ALTER TABLE "notification_deliveries" ADD COLUMN "notification_event_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "template" text NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_events" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_events" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_event_id_notification_events_id_fk" FOREIGN KEY ("notification_event_id") REFERENCES "public"."notification_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_event_template_recipient_key" ON "notification_deliveries" USING btree ("notification_event_id","template","recipient");--> statement-breakpoint
CREATE INDEX "notification_events_status_next_attempt_idx" ON "notification_events" USING btree ("status","next_attempt_at");--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_template_format" CHECK ("notification_deliveries"."template" ~ '^[a-z][a-z0-9_.]*$');