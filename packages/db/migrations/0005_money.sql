CREATE TABLE "document_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"paper" text NOT NULL,
	"design" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"render_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_files_kind" CHECK ("document_files"."kind" in ('pdf', 'jpg')),
	CONSTRAINT "document_files_paper" CHECK ("document_files"."paper" in ('a4', 'a5', '80mm', '58mm')),
	CONSTRAINT "document_files_design" CHECK ("document_files"."design" in ('classic', 'modern', 'simple'))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"date" date NOT NULL,
	"method" text,
	"note" text,
	"reversed_at" timestamp with time zone,
	"reversed_by" uuid,
	"reversal_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_kind" CHECK ("payments"."kind" in ('payment', 'adjustment')),
	CONSTRAINT "payments_amount" CHECK ("payments"."amount_paise" > 0),
	CONSTRAINT "payments_method" CHECK (("payments"."kind" = 'payment' and "payments"."method" in ('upi', 'cash', 'bank', 'cheque', 'other')) or ("payments"."kind" = 'adjustment' and "payments"."method" is null)),
	CONSTRAINT "payments_reversal" CHECK (("payments"."reversed_at" is null) = ("payments"."reversed_by" is null))
);
--> statement-breakpoint
CREATE TABLE "reminders_sent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"customer_id" uuid,
	"tone" text NOT NULL,
	"language" text NOT NULL,
	"text" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_sent_tone" CHECK ("reminders_sent"."tone" in ('gentle', 'direct', 'second'))
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', coalesce(number, '') || ' ' || coalesce(customer_name, ''))) STORED;--> statement-breakpoint
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reversed_by_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders_sent" ADD CONSTRAINT "reminders_sent_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders_sent" ADD CONSTRAINT "reminders_sent_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders_sent" ADD CONSTRAINT "reminders_sent_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders_sent" ADD CONSTRAINT "reminders_sent_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_files_one" ON "document_files" USING btree ("document_id","kind","paper","design");--> statement-breakpoint
CREATE INDEX "payments_document" ON "payments" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "payments_business_date" ON "payments" USING btree ("business_id","date");--> statement-breakpoint
CREATE INDEX "reminders_sent_document" ON "reminders_sent" USING btree ("document_id");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_search" ON "documents" USING gin ("search");--> statement-breakpoint
CREATE INDEX "documents_customer" ON "documents" USING btree ("business_id","customer_id");--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- By hand from here (CLAUDE.md: triggers and RLS live in the same migration).
grant select, insert, update on payments, document_files, reminders_sent to ekbill_app;
--> statement-breakpoint
-- Tenancy (I1), audit (I7), no deletes (8.3), no model writes (I6).
select apply_tenancy('payments');
select apply_tenancy('reminders_sent');
select apply_tenancy('document_files');
drop trigger if exists audit on document_files;
create trigger audit after insert or update on document_files for each row execute function audit_file_row();
--> statement-breakpoint
-- A rendered file is written once (I2: re-rendering an issued bill gives the same bill; a file is never changed).
create or replace function refuse_document_file_change() returns trigger
  language plpgsql as $$
begin
  raise exception 'ekbill: a rendered bill file is never changed' using errcode = 'insufficient_privilege';
end $$;
create trigger immutable_file before update on document_files for each row execute function refuse_document_file_change();
--> statement-breakpoint
-- A payment or an adjustment is never changed; a mistake is reversed, once, with a reason.
create or replace function refuse_payment_change() returns trigger
  language plpgsql as $$
begin
  if new.document_id is distinct from old.document_id or new.kind is distinct from old.kind
     or new.amount_paise is distinct from old.amount_paise or new.date is distinct from old.date
     or new.method is distinct from old.method or new.note is distinct from old.note
     or new.business_id is distinct from old.business_id or new.created_by is distinct from old.created_by then
    raise exception 'ekbill: a recorded payment is never changed; reverse it and record it again'
      using errcode = 'insufficient_privilege';
  end if;
  if old.reversed_at is not null then
    raise exception 'ekbill: this entry was reversed already' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger immutable_entry before update on payments for each row execute function refuse_payment_change();
--> statement-breakpoint
-- Money is recorded against an issued bill only (not a draft, not a cancelled bill, not a credit note).
create or replace function refuse_payment_on_wrong_document() returns trigger
  language plpgsql as $$
declare
  st text;
  k text;
begin
  select status, kind into st, k from documents where id = new.document_id;
  if st is distinct from 'issued' or k = 'credit_note' then
    raise exception 'ekbill: money is recorded against an issued bill only' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger payment_on_issued before insert on payments for each row execute function refuse_payment_on_wrong_document();
