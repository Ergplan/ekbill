CREATE TABLE "business_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_files_kind" CHECK ("business_files"."kind" in ('logo', 'signature')),
	CONSTRAINT "business_files_mime" CHECK ("business_files"."mime" in ('image/png', 'image/jpeg', 'image/webp')),
	CONSTRAINT "business_files_size" CHECK ("business_files"."size" between 1 and 307200),
	CONSTRAINT "business_files_sha256" CHECK ("business_files"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "pincode" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "pan" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "turnover_band" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "composition_legend" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "bank_name" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "bank_account" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "bank_ifsc" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "bank_holder" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "default_payment_terms_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "bill_design" text DEFAULT 'classic' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "bill_paper" text DEFAULT 'a4' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "bill_share_as" text DEFAULT 'pdf' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "bill_accent" text DEFAULT '#2f4a9e' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "logo_file_id" uuid;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "signature_file_id" uuid;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "default_series_id" uuid;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "voice_on_arrival" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "setup_done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "business_files" ADD CONSTRAINT "business_files_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_files" ADD CONSTRAINT "business_files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_files_business_kind" ON "business_files" USING btree ("business_id","kind");--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_logo_file_id_business_files_id_fk" FOREIGN KEY ("logo_file_id") REFERENCES "public"."business_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_signature_file_id_business_files_id_fk" FOREIGN KEY ("signature_file_id") REFERENCES "public"."business_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_default_series_id_series_id_fk" FOREIGN KEY ("default_series_id") REFERENCES "public"."series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_turnover_band" CHECK ("businesses"."turnover_band" is null or "businesses"."turnover_band" in ('40l', '40l-1.5cr', '1.5-5cr', '5cr+'));--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_pan" CHECK ("businesses"."pan" is null or "businesses"."pan" ~ '^[A-Z]{5}[0-9]{4}[A-Z]$');--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_pincode" CHECK ("businesses"."pincode" is null or "businesses"."pincode" ~ '^[1-9][0-9]{5}$');--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_payment_terms" CHECK ("businesses"."default_payment_terms_days" between 0 and 365);--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_bill_design" CHECK ("businesses"."bill_design" in ('classic', 'modern', 'simple'));--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_bill_paper" CHECK ("businesses"."bill_paper" in ('a4', 'a5', '80mm', '58mm'));--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_bill_share_as" CHECK ("businesses"."bill_share_as" in ('pdf', 'jpg'));--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_bill_accent" CHECK ("businesses"."bill_accent" ~ '^#[0-9a-fA-F]{6}$');--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- By hand from here (CLAUDE.md: triggers and RLS live in the same migration).
grant select, insert, update on business_files to ekbill_app;
--> statement-breakpoint
-- Tenancy (I1), audit (I7), no deletes (8.3), no model writes (I6). The audit row for a file carries its
-- metadata only: audit_row() stores to_jsonb(new), which would copy the bytes, so the trigger is replaced by
-- one that drops them first.
select apply_tenancy('business_files');
create or replace function audit_file_row() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  before_j jsonb;
  after_j jsonb;
begin
  after_j := to_jsonb(new) - 'bytes';
  if tg_op <> 'INSERT' then before_j := to_jsonb(old) - 'bytes'; end if;
  insert into audit_events (business_id, actor_user_id, actor_kind, table_name, row_id, action, before, after, request_id)
  values (new.business_id, app_setting('app.user_id')::uuid, coalesce(app_setting('app.actor_kind'), 'user'),
          tg_table_name, new.id::text, tg_op, before_j, after_j, app_setting('app.request_id'));
  return new;
end $$;
drop trigger if exists audit on business_files;
create trigger audit after insert or update on business_files for each row execute function audit_file_row();
--> statement-breakpoint
-- A file is written once: its bytes never change (replace it with a new row and re-point the business).
create or replace function refuse_file_change() returns trigger
  language plpgsql as $$
begin
  if new.bytes is distinct from old.bytes or new.sha256 is distinct from old.sha256 or new.mime is distinct from old.mime
     or new.kind is distinct from old.kind or new.business_id is distinct from old.business_id then
    raise exception 'ekbill: a stored file is never changed, add a new one' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger immutable_file before update on business_files for each row execute function refuse_file_change();
