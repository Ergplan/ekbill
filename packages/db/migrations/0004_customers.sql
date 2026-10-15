CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact_person" text,
	"phone" text,
	"email" text,
	"address" text,
	"city" text,
	"pincode" text,
	"state_code" text,
	"gstin" text,
	"pan" text,
	"language" text DEFAULT 'hi-Latn' NOT NULL,
	"language_source" text,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"last_billed_at" date,
	"import_row_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_phone" CHECK ("customers"."phone" is null or "customers"."phone" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "customers_gstin" CHECK ("customers"."gstin" is null or "customers"."gstin" ~ '^[0-9]{2}[A-Z0-9]{13}$'),
	CONSTRAINT "customers_pan" CHECK ("customers"."pan" is null or "customers"."pan" ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
	CONSTRAINT "customers_state_code" CHECK ("customers"."state_code" is null or "customers"."state_code" ~ '^[0-9]{2}$'),
	CONSTRAINT "customers_pincode" CHECK ("customers"."pincode" is null or "customers"."pincode" ~ '^[1-9][0-9]{5}$'),
	CONSTRAINT "customers_language" CHECK ("customers"."language" in ('hi-Latn', 'en', 'hi', 'mr', 'gu', 'ta', 'te', 'kn', 'bn')),
	CONSTRAINT "customers_language_source" CHECK ("customers"."language_source" is null or "customers"."language_source" in ('owner', 'guess'))
);
--> statement-breakpoint
CREATE TABLE "import_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_files_size" CHECK ("import_files"."size" between 1 and 8388608)
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"file_name" text NOT NULL,
	"candidate" jsonb NOT NULL,
	"existing_customer_id" uuid,
	"customer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"status" text DEFAULT 'reading' NOT NULL,
	"summary" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"committed_at" timestamp with time zone,
	"added_count" integer,
	CONSTRAINT "imports_status" CHECK ("imports"."status" in ('reading', 'ready', 'failed', 'committed'))
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"hsn_sac" text,
	"unit" text,
	"default_rate_paise" bigint,
	"default_tax_bp" integer,
	"price_includes_tax" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_hsn_sac" CHECK ("items"."hsn_sac" is null or "items"."hsn_sac" ~ '^[0-9]{2,8}$'),
	CONSTRAINT "items_rate" CHECK ("items"."default_rate_paise" is null or "items"."default_rate_paise" >= 0),
	CONSTRAINT "items_tax" CHECK ("items"."default_tax_bp" is null or "items"."default_tax_bp" between 0 and 10000)
);
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_files" ADD CONSTRAINT "import_files_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_files" ADD CONSTRAINT "import_files_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_existing_customer_id_customers_id_fk" FOREIGN KEY ("existing_customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_business_phone" ON "customers" USING btree ("business_id","phone") WHERE "customers"."phone" is not null;--> statement-breakpoint
CREATE INDEX "customers_business_name" ON "customers" USING btree ("business_id","name");--> statement-breakpoint
CREATE INDEX "import_files_import" ON "import_files" USING btree ("import_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_rows_import_position" ON "import_rows" USING btree ("import_id","position");--> statement-breakpoint
CREATE INDEX "imports_business_created" ON "imports" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "items_business_name" ON "items" USING btree ("business_id",lower("name"));--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- By hand from here (CLAUDE.md: triggers and RLS live in the same migration).
grant select, insert, update on customers, items, imports, import_files, import_rows to ekbill_app;
--> statement-breakpoint
-- Tenancy (I1), audit (I7), no deletes (8.3), no model writes (I6).
select apply_tenancy('customers');
select apply_tenancy('items');
select apply_tenancy('imports');
select apply_tenancy('import_rows');
--> statement-breakpoint
-- An import file's audit row carries its metadata, not its bytes (as business_files, 0003).
select apply_tenancy('import_files');
drop trigger if exists audit on import_files;
create trigger audit after insert or update on import_files for each row execute function audit_file_row();
create or replace function refuse_import_file_change() returns trigger
  language plpgsql as $$
begin
  if new.bytes is distinct from old.bytes or new.sha256 is distinct from old.sha256 or new.mime is distinct from old.mime
     or new.import_id is distinct from old.import_id or new.business_id is distinct from old.business_id then
    raise exception 'ekbill: a stored file is never changed' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger immutable_file before update on import_files for each row execute function refuse_import_file_change();
--> statement-breakpoint
-- An import row's reading never changes once written; only the link to the customer the owner's tick made.
create or replace function refuse_import_row_change() returns trigger
  language plpgsql as $$
begin
  if new.candidate is distinct from old.candidate or new.import_id is distinct from old.import_id
     or new.position is distinct from old.position or new.business_id is distinct from old.business_id
     or (old.customer_id is not null and new.customer_id is distinct from old.customer_id) then
    raise exception 'ekbill: an import row is what was read; only its customer link is written, once'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger immutable_reading before update on import_rows for each row execute function refuse_import_row_change();
