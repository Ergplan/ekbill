CREATE TABLE "extraction_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"extraction_id" uuid NOT NULL,
	"field" text NOT NULL,
	"model_value" text,
	"human_value" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"model" text,
	"prompt_version" text,
	"docling_used" boolean DEFAULT false NOT NULL,
	"image" "bytea",
	"result" jsonb,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"matched_customer_id" uuid,
	"match_score_pct" integer,
	"ai_call_id" uuid,
	"cost_micros" bigint,
	"latency_ms" integer,
	"committed_document_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extractions_status" CHECK ("extractions"."status" in ('pending', 'ready', 'failed', 'reviewed', 'committed', 'discarded')),
	CONSTRAINT "extractions_error" CHECK ("extractions"."error" is null or "extractions"."error" in ('unreadable', 'no-bill', 'ai-unavailable', 'invalid', 'error'))
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"kind" text DEFAULT 'bill-photo' NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uploads_kind" CHECK ("uploads"."kind" in ('bill-photo')),
	CONSTRAINT "uploads_size" CHECK ("uploads"."size" between 1 and 8388608)
);
--> statement-breakpoint
ALTER TABLE "extraction_corrections" ADD CONSTRAINT "extraction_corrections_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_corrections" ADD CONSTRAINT "extraction_corrections_extraction_id_extractions_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."extractions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_corrections" ADD CONSTRAINT "extraction_corrections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_matched_customer_id_customers_id_fk" FOREIGN KEY ("matched_customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_ai_call_id_ai_calls_id_fk" FOREIGN KEY ("ai_call_id") REFERENCES "public"."ai_calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_committed_document_id_documents_id_fk" FOREIGN KEY ("committed_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extraction_corrections_extraction" ON "extraction_corrections" USING btree ("extraction_id");--> statement-breakpoint
CREATE INDEX "extractions_business_created" ON "extractions" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "extractions_upload" ON "extractions" USING btree ("upload_id");--> statement-breakpoint
CREATE INDEX "uploads_business_created" ON "uploads" USING btree ("business_id","created_at");--> statement-breakpoint
-- By hand from here (CLAUDE.md: triggers and RLS live in the same migration).
grant select, insert, update on uploads, extractions, extraction_corrections to ekbill_app;
--> statement-breakpoint
-- Tenancy (I1), audit (I7), no deletes (8.3).
select apply_tenancy('uploads');
select apply_tenancy('extractions');
select apply_tenancy('extraction_corrections');
--> statement-breakpoint
-- The trail of a row that carries a photo leaves the bytes out (the photo is in the row itself).
create or replace function audit_photo_row() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  before_j jsonb;
  after_j jsonb;
begin
  after_j := to_jsonb(new) - 'bytes' - 'image';
  if tg_op <> 'INSERT' then before_j := to_jsonb(old) - 'bytes' - 'image'; end if;
  insert into audit_events (business_id, actor_user_id, actor_kind, table_name, row_id, action, before, after, request_id)
  values (new.business_id, app_setting('app.user_id')::uuid, coalesce(app_setting('app.actor_kind'), 'user'),
          tg_table_name, new.id::text, tg_op, before_j, after_j, app_setting('app.request_id'));
  return new;
end $$;
drop trigger if exists audit on uploads;
create trigger audit after insert or update on uploads for each row execute function audit_photo_row();
drop trigger if exists audit on extractions;
create trigger audit after insert or update on extractions for each row execute function audit_photo_row();
--> statement-breakpoint
-- The picked photo and the owner's corrections are never changed.
create trigger immutable_upload before update on uploads for each row execute function refuse_change();
create trigger immutable_correction before update on extraction_corrections for each row execute function refuse_change();
--> statement-breakpoint
-- I6: model output lands in staging only. A model may write one thing: the reading of a pending extraction
-- (pending → ready | failed). It never creates the row, never commits it, never points it at a document;
-- refuse_model_actor (apply_tenancy) keeps it off documents, customers and every authoritative table.
drop trigger if exists refuse_model_actor on extractions;
create or replace function guard_extraction() returns trigger
  language plpgsql as $$
declare
  actor text := coalesce(app_setting('app.actor_kind'), 'user');
begin
  if tg_op = 'INSERT' then
    if actor = 'model' then
      raise exception 'ekbill: a model may not start a reading (I6)' using errcode = 'insufficient_privilege';
    end if;
    if new.status <> 'pending' or new.result is not null or new.committed_document_id is not null then
      raise exception 'ekbill: a reading starts pending and empty' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if old.status in ('committed', 'discarded') then
    raise exception 'ekbill: this reading is % already', old.status using errcode = 'insufficient_privilege';
  end if;
  if old.result is not null and (new.result is distinct from old.result or new.image is distinct from old.image
     or new.model is distinct from old.model or new.prompt_version is distinct from old.prompt_version
     or new.warnings is distinct from old.warnings) then
    raise exception 'ekbill: what the model read is never changed (corrections are rows of their own)'
      using errcode = 'insufficient_privilege';
  end if;
  if new.upload_id is distinct from old.upload_id or new.business_id is distinct from old.business_id
     or new.created_by is distinct from old.created_by then
    raise exception 'ekbill: a reading stays with its photo' using errcode = 'insufficient_privilege';
  end if;
  if actor = 'model' then
    if old.status <> 'pending' or new.status not in ('ready', 'failed') or new.committed_document_id is not null then
      raise exception 'ekbill: a model may only record its reading (I6)' using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;
  if new.status = 'committed' then
    if new.committed_document_id is null
       or not exists (select 1 from documents d where d.id = new.committed_document_id and d.status = 'issued') then
      raise exception 'ekbill: a reading is committed by an issued bill only' using errcode = 'check_violation';
    end if;
  elsif new.committed_document_id is distinct from old.committed_document_id then
    raise exception 'ekbill: only the commit points a reading at a bill' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger guard_extraction before insert or update on extractions for each row execute function guard_extraction();
