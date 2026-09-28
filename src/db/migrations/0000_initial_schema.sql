CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_name" text NOT NULL,
	"anonymous_session_id" text NOT NULL,
	"application_id" uuid,
	"source" text,
	"campaign" text,
	"path" text,
	"referrer" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_events_event_name_valid" CHECK ("analytics_events"."event_name" in ('onboarding_view', 'vsl_start', 'vsl_25', 'vsl_50', 'vsl_75', 'vsl_complete', 'application_start', 'application_submit', 'application_accepted', 'application_rejected', 'scheduling_opened', 'meeting_booked')),
	CONSTRAINT "analytics_events_anonymous_session_id_length" CHECK (char_length("analytics_events"."anonymous_session_id") between 8 and 128),
	CONSTRAINT "analytics_events_source_length" CHECK (char_length("analytics_events"."source") between 1 and 100),
	CONSTRAINT "analytics_events_campaign_length" CHECK (char_length("analytics_events"."campaign") between 1 and 100),
	CONSTRAINT "analytics_events_path_length" CHECK (char_length("analytics_events"."path") between 1 and 2048),
	CONSTRAINT "analytics_events_referrer_length" CHECK (char_length("analytics_events"."referrer") between 1 and 2048),
	CONSTRAINT "analytics_events_metadata_is_object" CHECK ("analytics_events"."metadata" is null or jsonb_typeof("analytics_events"."metadata") = 'object')
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "application_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"question_key" text NOT NULL,
	"answer" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_answers_question_key_format" CHECK ("application_answers"."question_key" ~ '^[a-z][a-z0-9_]*$'),
	CONSTRAINT "application_answers_question_key_length" CHECK (char_length("application_answers"."question_key") between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "application_answers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_events_event_type_format" CHECK ("application_events"."event_type" ~ '^[A-Z][A-Z0-9_]*$'),
	CONSTRAINT "application_events_actor_type_valid" CHECK ("application_events"."actor_type" in ('SYSTEM', 'STAFF', 'APPLICANT', 'PROVIDER')),
	CONSTRAINT "application_events_metadata_is_object" CHECK ("application_events"."metadata" is null or jsonb_typeof("application_events"."metadata") = 'object')
);
--> statement-breakpoint
ALTER TABLE "application_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "application_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_notes_body_length" CHECK (char_length("application_notes"."body") between 1 and 10000)
);
--> statement-breakpoint
ALTER TABLE "application_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"lead_id" uuid NOT NULL,
	"service_tier_id" uuid,
	"form_version" text NOT NULL,
	"status" text DEFAULT 'NEW' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"rejection_reason" text,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_status_valid" CHECK ("applications"."status" in ('NEW', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'SCHEDULING_OPEN', 'SCHEDULED', 'COMPLETED', 'CONVERTED', 'WITHDRAWN', 'ARCHIVED', 'NO_SHOW')),
	CONSTRAINT "applications_reference_length" CHECK (char_length("applications"."reference") between 4 and 64),
	CONSTRAINT "applications_form_version_length" CHECK (char_length("applications"."form_version") between 1 and 50),
	CONSTRAINT "applications_rejection_reason_length" CHECK (char_length("applications"."rejection_reason") between 1 and 5000),
	CONSTRAINT "applications_rejection_reason_only_when_rejected" CHECK ("applications"."rejection_reason" is null or "applications"."status" = 'REJECTED')
);
--> statement-breakpoint
ALTER TABLE "applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "faqs_question_length" CHECK (char_length("faqs"."question") between 1 and 500),
	CONSTRAINT "faqs_answer_length" CHECK (char_length("faqs"."answer") between 1 and 10000)
);
--> statement-breakpoint
ALTER TABLE "faqs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "service_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"price_amount" integer,
	"currency" text,
	"billing_period" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_tiers_slug_format" CHECK ("service_tiers"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "service_tiers_name_length" CHECK (char_length("service_tiers"."name") between 1 and 200),
	CONSTRAINT "service_tiers_price_amount_non_negative" CHECK ("service_tiers"."price_amount" is null or "service_tiers"."price_amount" >= 0),
	CONSTRAINT "service_tiers_currency_format" CHECK ("service_tiers"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "service_tiers_price_currency_pair" CHECK (("service_tiers"."price_amount" is null) = ("service_tiers"."currency" is null)),
	CONSTRAINT "service_tiers_billing_period_length" CHECK (char_length("service_tiers"."billing_period") between 1 and 50),
	CONSTRAINT "service_tiers_features_is_array" CHECK (jsonb_typeof("service_tiers"."features") = 'array')
);
--> statement-breakpoint
ALTER TABLE "service_tiers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "site_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_config_key_format" CHECK ("site_config"."key" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
	CONSTRAINT "site_config_key_length" CHECK (char_length("site_config"."key") between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "site_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"company" text,
	"quote" text NOT NULL,
	"avatar_url" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "testimonials_name_length" CHECK (char_length("testimonials"."name") between 1 and 200),
	CONSTRAINT "testimonials_quote_length" CHECK (char_length("testimonials"."quote") between 1 and 5000),
	CONSTRAINT "testimonials_avatar_url_https" CHECK ("testimonials"."avatar_url" ~ '^https://')
);
--> statement-breakpoint
ALTER TABLE "testimonials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"company_name" text,
	"source" text,
	"campaign" text,
	"landing_path" text,
	"status" text DEFAULT 'NEW' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_status_valid" CHECK ("leads"."status" in ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST', 'ARCHIVED')),
	CONSTRAINT "leads_email_format" CHECK ("leads"."email" ~ '^[^@\s]+@[^@\s]+$'),
	CONSTRAINT "leads_email_length" CHECK (char_length("leads"."email") between 3 and 320),
	CONSTRAINT "leads_full_name_length" CHECK (char_length("leads"."full_name") between 1 and 200),
	CONSTRAINT "leads_phone_length" CHECK (char_length("leads"."phone") between 1 and 50),
	CONSTRAINT "leads_company_name_length" CHECK (char_length("leads"."company_name") between 1 and 200),
	CONSTRAINT "leads_source_length" CHECK (char_length("leads"."source") between 1 and 100),
	CONSTRAINT "leads_campaign_length" CHECK (char_length("leads"."campaign") between 1 and 100),
	CONSTRAINT "leads_landing_path_length" CHECK (char_length("leads"."landing_path") between 1 and 2048)
);
--> statement-breakpoint
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"recipient" text NOT NULL,
	"provider" text NOT NULL,
	"provider_message_id" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_status_valid" CHECK ("notification_deliveries"."status" in ('PENDING', 'SENT', 'FAILED')),
	CONSTRAINT "notification_deliveries_event_type_format" CHECK ("notification_deliveries"."event_type" ~ '^[A-Z][A-Z0-9_]*$'),
	CONSTRAINT "notification_deliveries_provider_format" CHECK ("notification_deliveries"."provider" ~ '^[a-z][a-z0-9_-]*$'),
	CONSTRAINT "notification_deliveries_recipient_length" CHECK (char_length("notification_deliveries"."recipient") between 3 and 320),
	CONSTRAINT "notification_deliveries_attempts_non_negative" CHECK ("notification_deliveries"."attempts" >= 0),
	CONSTRAINT "notification_deliveries_last_error_length" CHECK (char_length("notification_deliveries"."last_error") between 1 and 2000),
	CONSTRAINT "notification_deliveries_sent_at_when_sent" CHECK ("notification_deliveries"."status" <> 'SENT' or "notification_deliveries"."sent_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"meeting_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meetings_status_valid" CHECK ("meetings"."status" in ('SCHEDULED', 'CANCELLED', 'RESCHEDULED', 'COMPLETED', 'NO_SHOW')),
	CONSTRAINT "meetings_provider_format" CHECK ("meetings"."provider" ~ '^[a-z][a-z0-9_-]*$'),
	CONSTRAINT "meetings_ends_after_start" CHECK ("meetings"."ends_at" > "meetings"."starts_at"),
	CONSTRAINT "meetings_meeting_url_https" CHECK ("meetings"."meeting_url" ~ '^https://')
);
--> statement-breakpoint
ALTER TABLE "meetings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scheduling_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"token_hash" text,
	"expires_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"provider" text NOT NULL,
	"provider_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_sessions_provider_format" CHECK ("scheduling_sessions"."provider" ~ '^[a-z][a-z0-9_-]*$'),
	CONSTRAINT "scheduling_sessions_token_hash_length" CHECK (char_length("scheduling_sessions"."token_hash") between 32 and 256),
	CONSTRAINT "scheduling_sessions_token_requires_expiry" CHECK ("scheduling_sessions"."token_hash" is null or "scheduling_sessions"."expires_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "scheduling_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_action_format" CHECK ("audit_logs"."action" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
	CONSTRAINT "audit_logs_entity_type_format" CHECK ("audit_logs"."entity_type" ~ '^[a-z][a-z0-9_]*$'),
	CONSTRAINT "audit_logs_metadata_is_object" CHECK ("audit_logs"."metadata" is null or jsonb_typeof("audit_logs"."metadata") = 'object')
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_provider_id" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_users_role_valid" CHECK ("staff_users"."role" in ('ADMIN', 'REVIEWER')),
	CONSTRAINT "staff_users_email_format" CHECK ("staff_users"."email" ~ '^[^@\s]+@[^@\s]+$'),
	CONSTRAINT "staff_users_display_name_length" CHECK (char_length("staff_users"."display_name") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "staff_users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_author_id_staff_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_service_tier_id_service_tiers_id_fk" FOREIGN KEY ("service_tier_id") REFERENCES "public"."service_tiers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_reviewed_by_staff_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_sessions" ADD CONSTRAINT "scheduling_sessions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_staff_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_events_event_name_created_at_idx" ON "analytics_events" USING btree ("event_name","created_at");--> statement-breakpoint
CREATE INDEX "analytics_events_created_at_idx" ON "analytics_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "analytics_events_application_id_idx" ON "analytics_events" USING btree ("application_id") WHERE application_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "application_answers_application_question_key" ON "application_answers" USING btree ("application_id","question_key");--> statement-breakpoint
CREATE INDEX "application_events_application_id_created_at_idx" ON "application_events" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "application_notes_application_id_created_at_idx" ON "application_notes" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "application_notes_author_id_idx" ON "application_notes" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_reference_key" ON "applications" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "applications_status_created_at_idx" ON "applications" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "applications_created_at_idx" ON "applications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "applications_lead_id_idx" ON "applications" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "applications_service_tier_id_idx" ON "applications" USING btree ("service_tier_id");--> statement-breakpoint
CREATE INDEX "applications_reviewed_by_idx" ON "applications" USING btree ("reviewed_by");--> statement-breakpoint
CREATE INDEX "faqs_active_display_order_idx" ON "faqs" USING btree ("display_order") WHERE is_active;--> statement-breakpoint
CREATE UNIQUE INDEX "service_tiers_slug_key" ON "service_tiers" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "service_tiers_active_display_order_idx" ON "service_tiers" USING btree ("display_order") WHERE is_active;--> statement-breakpoint
CREATE UNIQUE INDEX "site_config_key_key" ON "site_config" USING btree ("key");--> statement-breakpoint
CREATE INDEX "site_config_public_idx" ON "site_config" USING btree ("key") WHERE is_public;--> statement-breakpoint
CREATE INDEX "testimonials_active_display_order_idx" ON "testimonials" USING btree ("display_order") WHERE is_active;--> statement-breakpoint
CREATE INDEX "leads_email_lower_idx" ON "leads" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leads_created_at_idx" ON "leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "leads_source_idx" ON "leads" USING btree ("source");--> statement-breakpoint
CREATE INDEX "leads_campaign_idx" ON "leads" USING btree ("campaign");--> statement-breakpoint
CREATE INDEX "notification_deliveries_status_created_at_idx" ON "notification_deliveries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_created_at_idx" ON "notification_deliveries" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_provider_message_key" ON "notification_deliveries" USING btree ("provider","provider_message_id") WHERE provider_message_id is not null;--> statement-breakpoint
CREATE INDEX "meetings_application_id_idx" ON "meetings" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "meetings_starts_at_idx" ON "meetings" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meetings_provider_event_key" ON "meetings" USING btree ("provider","provider_event_id") WHERE provider_event_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "scheduling_sessions_application_id_key" ON "scheduling_sessions" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduling_sessions_token_hash_key" ON "scheduling_sessions" USING btree ("token_hash") WHERE token_hash is not null;--> statement-breakpoint
CREATE INDEX "scheduling_sessions_expires_at_idx" ON "scheduling_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_users_auth_provider_id_key" ON "staff_users" USING btree ("auth_provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_users_email_lower_key" ON "staff_users" USING btree (lower("email"));