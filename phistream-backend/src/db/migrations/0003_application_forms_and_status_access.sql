CREATE TABLE "application_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_access_tokens_purpose_valid" CHECK ("application_access_tokens"."purpose" in ('STATUS')),
	CONSTRAINT "application_access_tokens_token_hash_format" CHECK ("application_access_tokens"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "application_access_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "application_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"definition" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_forms_status_valid" CHECK ("application_forms"."status" in ('DRAFT', 'ACTIVE', 'RETIRED')),
	CONSTRAINT "application_forms_version_format" CHECK ("application_forms"."version" ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$'),
	CONSTRAINT "application_forms_definition_is_object" CHECK (jsonb_typeof("application_forms"."definition") = 'object'),
	CONSTRAINT "application_forms_published_at_when_published" CHECK ("application_forms"."status" = 'DRAFT' or "application_forms"."published_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "application_forms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "applications" DROP CONSTRAINT "applications_rejection_reason_only_when_rejected";--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "submission_fingerprint" text;--> statement-breakpoint
ALTER TABLE "application_access_tokens" ADD CONSTRAINT "application_access_tokens_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_access_tokens_token_hash_key" ON "application_access_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "application_access_tokens_application_id_idx" ON "application_access_tokens" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "application_access_tokens_expires_at_idx" ON "application_access_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "application_forms_version_key" ON "application_forms" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "application_forms_single_active_key" ON "application_forms" USING btree ("status") WHERE status = 'ACTIVE';--> statement-breakpoint
-- Hand-written: existing applications (e.g. demo data) reference form versions
-- that predate this table. Record them as RETIRED placeholders so the foreign
-- key below can be added; they are never served (not ACTIVE).
INSERT INTO "application_forms" ("version", "status", "definition", "published_at", "retired_at")
SELECT DISTINCT "form_version", 'RETIRED', '{"legacyPlaceholder": true, "questions": []}'::jsonb, now(), now()
FROM "applications"
ON CONFLICT ("version") DO NOTHING;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_form_version_application_forms_version_fk" FOREIGN KEY ("form_version") REFERENCES "public"."application_forms"("version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_form_version_idx" ON "applications" USING btree ("form_version");--> statement-breakpoint
CREATE INDEX "applications_submission_fingerprint_idx" ON "applications" USING btree ("submission_fingerprint","created_at") WHERE submission_fingerprint is not null;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_submission_fingerprint_format" CHECK ("applications"."submission_fingerprint" is null or "applications"."submission_fingerprint" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_rejection_reason_only_when_rejected" CHECK ("applications"."rejection_reason" is null or "applications"."status" in ('REJECTED', 'ARCHIVED'));
--> statement-breakpoint
-- Hand-written: a published form version is immutable. Answers are stored per
-- question key and interpreted against the version's definition, so changing
-- a definition after applicants used it would corrupt their meaning. Publish a
-- new version instead. Published versions cannot return to DRAFT.
CREATE FUNCTION "application_forms_protect_published"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF OLD.status <> 'DRAFT' AND (
    NEW.definition IS DISTINCT FROM OLD.definition
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.status = 'DRAFT'
  ) THEN
    RAISE EXCEPTION 'application form version % is published and cannot be changed', OLD.version
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "application_forms_protect_published"
BEFORE UPDATE ON "application_forms"
FOR EACH ROW EXECUTE FUNCTION "application_forms_protect_published"();--> statement-breakpoint
REVOKE ALL ON FUNCTION "application_forms_protect_published"() FROM PUBLIC;
