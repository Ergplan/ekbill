CREATE TABLE "search_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"source_id" uuid NOT NULL,
	"title" text NOT NULL,
	"text" text NOT NULL,
	"href" text NOT NULL,
	"version" text NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', title || ' ' || text)) STORED,
	"embedding" vector(256),
	"embedded_version" text,
	"embed_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_records_kind" CHECK ("search_records"."kind" in ('bill', 'customer', 'item'))
);
--> statement-breakpoint
ALTER TABLE "search_records" ADD CONSTRAINT "search_records_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "search_records_source" ON "search_records" USING btree ("business_id","kind","source_id");--> statement-breakpoint
CREATE INDEX "search_records_tsv" ON "search_records" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "search_records_embedding" ON "search_records" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
-- By hand from here (CLAUDE.md: triggers and RLS live in the same migration).
grant select, insert, update on search_records to ekbill_app;
--> statement-breakpoint
-- Tenancy (I1), no deletes (8.3), no model writes (I6).
select apply_tenancy('search_records');
--> statement-breakpoint
-- The index is derived from audited rows and rewritten whenever they change; auditing it would
-- copy every bill's text into audit_events on every payment. Its trail is the records' own.
drop trigger if exists audit on search_records;
