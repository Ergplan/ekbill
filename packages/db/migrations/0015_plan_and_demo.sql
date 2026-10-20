CREATE TABLE "demo_audio" (
	"locale" text NOT NULL,
	"line_id" text NOT NULL,
	"text_sha256" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_audio_locale_line_id_text_sha256_pk" PRIMARY KEY("locale","line_id","text_sha256")
);
--> statement-breakpoint
CREATE TABLE "plan_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"amount_paise" integer NOT NULL,
	"discount_paise" integer DEFAULT 0 NOT NULL,
	"utr" text NOT NULL,
	"status" text DEFAULT 'claimed' NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_payments_utr_unique" UNIQUE("utr"),
	CONSTRAINT "plan_payments_status" CHECK ("plan_payments"."status" in ('claimed', 'confirmed', 'rejected')),
	CONSTRAINT "plan_payments_amount" CHECK ("plan_payments"."amount_paise" > 0 and "plan_payments"."discount_paise" >= 0),
	CONSTRAINT "plan_payments_period" CHECK ("plan_payments"."period_end" >= "plan_payments"."period_start"),
	CONSTRAINT "plan_payments_utr" CHECK ("plan_payments"."utr" ~ '^[0-9]{12}$')
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_codes_business_id_unique" UNIQUE("business_id"),
	CONSTRAINT "referral_codes_code" CHECK ("referral_codes"."code" ~ '^[A-Z2-9]{6}$')
);
--> statement-breakpoint
CREATE TABLE "referral_joins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"friend_business_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"earned_at" timestamp with time zone,
	"used_payment_id" uuid,
	CONSTRAINT "referral_joins_friend_business_id_unique" UNIQUE("friend_business_id"),
	CONSTRAINT "referral_joins_not_self" CHECK ("referral_joins"."business_id" <> "referral_joins"."friend_business_id"),
	CONSTRAINT "referral_joins_used_after_earned" CHECK ("referral_joins"."used_payment_id" is null or "referral_joins"."earned_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "referred_by" uuid;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "plan_comp_until" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "demo_seen_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_payments" ADD CONSTRAINT "plan_payments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_payments" ADD CONSTRAINT "plan_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_joins" ADD CONSTRAINT "referral_joins_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_joins" ADD CONSTRAINT "referral_joins_friend_business_id_businesses_id_fk" FOREIGN KEY ("friend_business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_payments_business" ON "plan_payments" USING btree ("business_id","period_end");--> statement-breakpoint
CREATE INDEX "referral_joins_business" ON "referral_joins" USING btree ("business_id");--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_referred_by_businesses_id_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- By hand from here (CLAUDE.md: triggers and RLS live in the same migration).
grant select, insert, update on plan_payments, referral_joins to ekbill_app;
grant select, insert on referral_codes, demo_audio to ekbill_app;
--> statement-breakpoint
-- Tenancy (I1), audit (I7), no deletes (8.3), no model writes (I6). A referral join lives under the referrer.
select apply_tenancy('plan_payments');
select apply_tenancy('referral_joins');
--> statement-breakpoint
-- A code only maps to its business; a sign-up reads it before it has a business of its own, so no row security.
-- Never deleted or changed. Not audited: the audit trail keys rows by an id, and a code is all there is to it
-- (the business's own audit shows the sign-ups and bills it leads to).
select apply_tenancy('referral_codes', false);
drop trigger if exists audit on referral_codes;
drop trigger if exists refuse_change on referral_codes;
create trigger refuse_change before update on referral_codes for each row execute function refuse_change();
--> statement-breakpoint
-- Recorded speech for the demo: no business, nothing personal; kept, never changed (a new text is a new row).
drop trigger if exists refuse_delete on demo_audio;
create trigger refuse_delete before delete on demo_audio for each row execute function refuse_delete();
drop trigger if exists refuse_change on demo_audio;
create trigger refuse_change before update on demo_audio for each row execute function refuse_change();
