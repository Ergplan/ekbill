-- Stage 5 review: an import's files and readings were frozen only in part. A stored import file keeps its name,
-- size, id and creation as well as its bytes; a reading keeps its id, its file and what it matched, and only the
-- customer link the owner's tick makes is written, once. A file's size is its bytes' size (as business_files, 0011).
alter table import_files add constraint import_files_size_is_bytes check (octet_length(bytes) = size) not valid;
--> statement-breakpoint
do $$
begin
  alter table import_files validate constraint import_files_size_is_bytes;
exception when check_violation then
  raise notice 'ekbill: an import file''s size disagrees with its bytes; the check applies to new files only';
end $$;
--> statement-breakpoint
create or replace function refuse_import_file_change() returns trigger
  language plpgsql as $$
begin
  if new.bytes is distinct from old.bytes or new.sha256 is distinct from old.sha256 or new.mime is distinct from old.mime
     or new.import_id is distinct from old.import_id or new.business_id is distinct from old.business_id
     or new.id is distinct from old.id or new.name is distinct from old.name or new.size is distinct from old.size
     or new.created_at is distinct from old.created_at then
    raise exception 'ekbill: a stored file is never changed' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
--> statement-breakpoint
create or replace function refuse_import_row_change() returns trigger
  language plpgsql as $$
begin
  if new.candidate is distinct from old.candidate or new.import_id is distinct from old.import_id
     or new.position is distinct from old.position or new.business_id is distinct from old.business_id
     or new.id is distinct from old.id or new.file_name is distinct from old.file_name
     or new.existing_customer_id is distinct from old.existing_customer_id
     or new.created_at is distinct from old.created_at
     or (old.customer_id is not null and new.customer_id is distinct from old.customer_id) then
    raise exception 'ekbill: an import row is what was read; only its customer link is written, once'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
