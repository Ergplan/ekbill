CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"number" text,
	"financial_year" text,
	"issue_date" date NOT NULL,
	"due_date" date,
	"customer_id" uuid,
	"customer_name" text NOT NULL,
	"customer_gstin" text,
	"customer_state" text,
	"customer_address" text,
	"customer_phone" text,
	"place_of_supply_state" text,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"totals" jsonb,
	"issued_snapshot" jsonb,
	"issued_at" timestamp with time zone,
	"linked_document_id" uuid,
	"irn" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_reason" text,
	"notes" text,
	"round_to_rupee" boolean DEFAULT false NOT NULL,
	"gst_on" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_kind" CHECK ("documents"."kind" in ('tax_invoice', 'bill_of_supply', 'credit_note')),
	CONSTRAINT "documents_status" CHECK ("documents"."status" in ('draft', 'issued', 'cancelled')),
	CONSTRAINT "documents_issued_complete" CHECK (("documents"."status" = 'draft' and "documents"."number" is null and "documents"."issued_snapshot" is null and "documents"."issued_at" is null)
        or ("documents"."status" in ('issued', 'cancelled') and "documents"."number" is not null and "documents"."financial_year" is not null and "documents"."issued_snapshot" is not null and "documents"."issued_at" is not null)),
	CONSTRAINT "documents_cancelled_complete" CHECK (("documents"."status" = 'cancelled') = ("documents"."cancelled_at" is not null)),
	CONSTRAINT "documents_credit_note_linked" CHECK ("documents"."kind" <> 'credit_note' or "documents"."linked_document_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'bill' NOT NULL,
	"prefix" text DEFAULT '' NOT NULL,
	"padding" integer DEFAULT 3 NOT NULL,
	"include_fy" boolean DEFAULT false NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"fy" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_kind" CHECK ("series"."kind" in ('bill', 'credit_note')),
	CONSTRAINT "series_prefix" CHECK ("series"."prefix" ~ '^[A-Za-z0-9/-]{0,10}$'),
	CONSTRAINT "series_padding" CHECK ("series"."padding" between 1 and 8),
	CONSTRAINT "series_next_number" CHECK ("series"."next_number" between 1 and 99999999),
	CONSTRAINT "series_fy" CHECK ("series"."fy" is null or "series"."fy" ~ '^[0-9]{4}-[0-9]{2}$')
);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "registration_type" text DEFAULT 'not-sure' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "gstin" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "state_code" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "turnover_paise" bigint;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "e_invoicing_applies" boolean;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "upi" text;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_linked_document_id_documents_id_fk" FOREIGN KEY ("linked_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "documents_number" ON "documents" USING btree ("business_id","series_id","financial_year","number") WHERE "documents"."number" is not null;--> statement-breakpoint
CREATE INDEX "documents_business_status_date" ON "documents" USING btree ("business_id","status","issue_date");--> statement-breakpoint
CREATE INDEX "documents_linked" ON "documents" USING btree ("linked_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "series_business_name" ON "series" USING btree ("business_id","name");--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_registration_type" CHECK ("businesses"."registration_type" in ('regular', 'composition', 'not-registered', 'not-sure'));--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_gstin" CHECK ("businesses"."gstin" is null or "businesses"."gstin" ~ '^[0-9]{2}[A-Z0-9]{13}$');--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_state_code" CHECK ("businesses"."state_code" is null or "businesses"."state_code" ~ '^[0-9]{2}$');--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_turnover" CHECK ("businesses"."turnover_paise" is null or "businesses"."turnover_paise" >= 0);--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- By hand from here (CLAUDE.md: triggers and RLS live in the same migration).
grant select, insert, update on series, documents to ekbill_app;
--> statement-breakpoint
-- Tenancy (I1), audit (I7), no deletes (8.3), no model writes (I6) on both tables.
select apply_tenancy('series');
select apply_tenancy('documents');
--> statement-breakpoint
-- I2: one writer for issued documents. Only issueDocument() moves a row to
-- 'issued'; it says so with the transaction-local setting app.issuing = '1'
-- (set_config(..., true)), which nothing else sets. A row inserted as issued,
-- or updated to issued, outside that setting is refused.
create or replace function refuse_issue_outside_issue_document() returns trigger
  language plpgsql as $$
begin
  if new.status = 'issued' and (tg_op = 'INSERT' or old.status is distinct from 'issued')
     and coalesce(app_setting('app.issuing'), '') <> '1' then
    raise exception 'ekbill: only issueDocument() issues a document (I2)' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger issue_gate before insert or update on documents
  for each row execute function refuse_issue_outside_issue_document();
--> statement-breakpoint
-- I2: an issued or cancelled document is immutable where it matters. Its
-- number, year, kind, series, date, customer, lines, totals, snapshot and
-- issue time never change; status moves only from issued to cancelled, and
-- a cancellation is final. What may still change: the cancellation itself,
-- the IRN once reported, the due date, notes, the revision and updated_at.
create or replace function refuse_issued_change() returns trigger
  language plpgsql as $$
begin
  if old.status in ('issued', 'cancelled') then
    if new.id is distinct from old.id
       or new.number is distinct from old.number
       or new.financial_year is distinct from old.financial_year
       or new.issued_at is distinct from old.issued_at
       or new.issued_snapshot is distinct from old.issued_snapshot
       or new.totals is distinct from old.totals
       or new.lines is distinct from old.lines
       or new.kind is distinct from old.kind
       or new.series_id is distinct from old.series_id
       or new.issue_date is distinct from old.issue_date
       or new.customer_id is distinct from old.customer_id
       or new.customer_name is distinct from old.customer_name
       or new.customer_gstin is distinct from old.customer_gstin
       or new.customer_state is distinct from old.customer_state
       or new.place_of_supply_state is distinct from old.place_of_supply_state
       or new.flags is distinct from old.flags
       or new.linked_document_id is distinct from old.linked_document_id
       or new.gst_on is distinct from old.gst_on
       or new.round_to_rupee is distinct from old.round_to_rupee
       or new.business_id is distinct from old.business_id
       or new.created_by is distinct from old.created_by then
      raise exception 'ekbill: document % is %, it cannot be changed (I2: correct it with a credit note or a redo)', old.number, old.status
        using errcode = 'insufficient_privilege';
    end if;
    if old.status = 'cancelled' and new.status <> 'cancelled' then
      raise exception 'ekbill: document % is cancelled, that is final', old.number using errcode = 'insufficient_privilege';
    end if;
    if old.status = 'issued' and new.status = 'draft' then
      raise exception 'ekbill: document % is issued, it cannot go back to a draft', old.number using errcode = 'insufficient_privilege';
    end if;
    if old.irn is not null and new.irn is distinct from old.irn then
      raise exception 'ekbill: document % already carries an IRN', old.number using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;
create trigger immutable_once_issued before update on documents
  for each row execute function refuse_issued_change();
