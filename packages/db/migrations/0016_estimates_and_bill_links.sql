CREATE TABLE "bill_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"business_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_links_token_unique" UNIQUE("token"),
	CONSTRAINT "bill_links_document_id_unique" UNIQUE("document_id"),
	CONSTRAINT "bill_links_token" CHECK ("bill_links"."token" ~ '^[A-Za-z0-9_-]{22}$')
);
--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "documents_kind";--> statement-breakpoint
ALTER TABLE "series" DROP CONSTRAINT "series_kind";--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "from_estimate_id" uuid;--> statement-breakpoint
ALTER TABLE "bill_links" ADD CONSTRAINT "bill_links_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_links" ADD CONSTRAINT "bill_links_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_links" ADD CONSTRAINT "bill_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_from_estimate_id_documents_id_fk" FOREIGN KEY ("from_estimate_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_from_estimate" ON "documents" USING btree ("from_estimate_id");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_from_estimate_bill" CHECK ("documents"."from_estimate_id" is null or "documents"."kind" in ('tax_invoice', 'bill_of_supply'));--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_kind" CHECK ("documents"."kind" in ('tax_invoice', 'bill_of_supply', 'credit_note', 'estimate'));--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_kind" CHECK ("series"."kind" in ('bill', 'credit_note', 'estimate'));--> statement-breakpoint
-- By hand from here (CLAUDE.md: triggers and RLS live in the same migration).
--
-- Kaccha bills (20 Oct): an estimate is numbered in its own series and issued through issueDocument() like a bill,
-- so the issue gate and the immutability trigger hold for it as they are. Its link to the pakka bill made from it
-- is fixed once that bill is issued, like every other column the customer saw.
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
       or new.from_estimate_id is distinct from old.from_estimate_id
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
--> statement-breakpoint
-- Money is recorded against an issued bill only: not a draft, a cancelled bill, a credit note, or a kaccha bill
-- (an estimate is paid by the pakka bill made from it).
create or replace function refuse_payment_on_wrong_document() returns trigger
  language plpgsql as $$
declare
  st text;
  k text;
begin
  select status, kind into st, k from documents where id = new.document_id;
  if st is distinct from 'issued' or k in ('credit_note', 'estimate') then
    raise exception 'ekbill: money is recorded against an issued bill only' using errcode = 'check_violation';
  end if;
  return new;
end $$;
--> statement-breakpoint
-- A pakka bill names an estimate of its own business, and only an estimate.
create or replace function refuse_wrong_estimate() returns trigger
  language plpgsql as $$
declare
  k text;
  biz uuid;
begin
  if new.from_estimate_id is null then
    return new;
  end if;
  select kind, business_id into k, biz from documents where id = new.from_estimate_id;
  if k is distinct from 'estimate' or biz is distinct from new.business_id then
    raise exception 'ekbill: a bill is made from an estimate of the same business' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger from_estimate_is_estimate before insert or update of from_estimate_id on documents
  for each row execute function refuse_wrong_estimate();
--> statement-breakpoint
-- Bill links (20 Oct): written under the business's own tenancy; read, with no business, by the one token asked
-- for (the public bill page sets app.bill_link to it), never listed. Audited, never changed or deleted.
grant select, insert on bill_links to ekbill_app;
select apply_tenancy('bill_links');
create policy by_token on bill_links for select using (token = app_setting('app.bill_link'));
drop trigger if exists refuse_change on bill_links;
create trigger refuse_change before update on bill_links for each row execute function refuse_change();
