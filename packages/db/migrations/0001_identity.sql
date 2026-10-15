CREATE TABLE "ai_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid,
	"user_id" uuid,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_micros" bigint,
	"latency_ms" integer,
	"outcome" text NOT NULL,
	"error" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_calls_outcome" CHECK ("ai_calls"."outcome" in ('ok', 'error', 'timeout', 'refused'))
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_kind" text NOT NULL,
	"table_name" text NOT NULL,
	"row_id" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"request_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_actor_kind" CHECK ("audit_events"."actor_kind" in ('user', 'model', 'system')),
	CONSTRAINT "audit_events_action" CHECK ("audit_events"."action" in ('INSERT', 'UPDATE', 'DELETE'))
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text NOT NULL,
	"trade_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "businesses_status" CHECK ("businesses"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"invited_by" uuid,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "memberships_role" CHECK ("memberships"."role" in ('owner', 'staff', 'accountant')),
	CONSTRAINT "memberships_status" CHECK ("memberships"."status" in ('invited', 'active', 'removed'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"business_id" uuid,
	"role" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	CONSTRAINT "sessions_role" CHECK ("sessions"."role" is null or "sessions"."role" in ('owner', 'staff', 'accountant'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_e164" text NOT NULL,
	"name" text NOT NULL,
	"theme" text DEFAULT 'narangi' NOT NULL,
	"language" text DEFAULT 'hi-Latn' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "users_phone_e164_unique" UNIQUE("phone_e164"),
	CONSTRAINT "users_theme" CHECK ("users"."theme" in ('narangi', 'harmony', 'system')),
	CONSTRAINT "users_language" CHECK ("users"."language" in ('hi-Latn', 'en')),
	CONSTRAINT "users_phone_e164" CHECK ("users"."phone_e164" ~ '^\+[1-9][0-9]{7,14}$')
);
--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_calls_business_at" ON "ai_calls" USING btree ("business_id","at");--> statement-breakpoint
CREATE INDEX "audit_events_business_at" ON "audit_events" USING btree ("business_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_business_user" ON "memberships" USING btree ("business_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_one_active_owner" ON "memberships" USING btree ("business_id") WHERE "memberships"."role" = 'owner' and "memberships"."status" = 'active';--> statement-breakpoint
CREATE INDEX "memberships_user" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user" ON "sessions" USING btree ("user_id");
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- By hand from here (CLAUDE.md: triggers and RLS live in the same migration).
-- include tenancy.sql
--> statement-breakpoint
-- Privileges of the application role (ekbill_app): it reads and writes through RLS; audit_events it may only read.
grant select, insert, update on users, businesses, memberships, sessions, ai_calls to ekbill_app;
grant delete on sessions to ekbill_app;
grant select on audit_events to ekbill_app;
grant usage, select on all sequences in schema public to ekbill_app;
--> statement-breakpoint
-- Tenancy (I1): businesses by their own id; ai_calls by business with a null row for system calls;
-- memberships audited but readable before a scope exists (resolveScope); users and sessions carry no business data.
select apply_tenancy('businesses', true, 'id');
select apply_tenancy('memberships', false);
--> statement-breakpoint
alter table ai_calls enable row level security;
alter table ai_calls force row level security;
create policy tenant_isolation on ai_calls
  using (business_id is null or business_id = app_business_id())
  with check (business_id is null or business_id = app_business_id());
create trigger refuse_delete before delete on ai_calls for each row execute function refuse_delete();
--> statement-breakpoint
-- The audit trail (I7): readable per business, written by the trigger alone, never changed.
alter table audit_events enable row level security;
create policy tenant_read on audit_events for select using (business_id = app_business_id());
create trigger refuse_change before update or delete on audit_events for each row execute function refuse_change();
revoke update, delete on audit_events from public;
