ALTER TABLE "applications" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "campaign" text;--> statement-breakpoint
CREATE INDEX "applications_submitted_at_idx" ON "applications" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX "applications_source_submitted_at_idx" ON "applications" USING btree ("source","submitted_at");--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_source_length" CHECK (char_length("applications"."source") between 1 and 100);--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_campaign_length" CHECK (char_length("applications"."campaign") between 1 and 100);--> statement-breakpoint
-- Hand-written: attribute existing applications with their lead's (first-touch)
-- source/campaign, the best information available for rows created before
-- per-application attribution existed.
UPDATE "applications" AS a
SET "source" = l."source", "campaign" = l."campaign"
FROM "leads" AS l
WHERE l."id" = a."lead_id" AND a."source" IS NULL AND a."campaign" IS NULL;
