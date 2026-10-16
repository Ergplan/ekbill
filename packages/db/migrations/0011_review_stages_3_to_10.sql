-- The stage reviews 3 to 10 (rule 12).
--
-- Stage 3, I2: the issue gate refused an INSERT as 'issued' but let one in as 'cancelled', complete with a forged
-- number and snapshot (GSTR-1 Table 13 would count it). Every document now starts as a draft; only
-- issueDocument() moves it on, and only cancelDocument() from there.
create or replace function refuse_issue_outside_issue_document() returns trigger
  language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'ekbill: a document starts as a draft; only issueDocument() issues it (I2)'
      using errcode = 'insufficient_privilege';
  end if;
  if new.status = 'issued' and (tg_op = 'INSERT' or old.status is distinct from 'issued')
     and coalesce(app_setting('app.issuing'), '') <> '1' then
    raise exception 'ekbill: only issueDocument() issues a document (I2)' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
--> statement-breakpoint
-- Stage 3, I3 and Rule 46: a number is unique in the business for the year, whatever series gave it. Two series
-- whose numbers meet (INV- with padding 3 and INV-0 with padding 2 both give INV-001) would put two documents under
-- one number, and GSTR-1 would merge them. A database already holding such a pair keeps working (the index is
-- left out, with a notice) until the pair is sorted out by hand.
do $$
begin
  if exists (
    select 1 from documents where number is not null
    group by business_id, financial_year, number having count(*) > 1
  ) then
    raise notice 'ekbill: documents share a number within a year; documents_business_fy_number not created';
  else
    create unique index if not exists documents_business_fy_number
      on documents (business_id, financial_year, number) where number is not null;
  end if;
end $$;
--> statement-breakpoint
-- Stage 4: a stored file's size is its bytes' size, and none of what identifies it changes after it is written.
alter table business_files add constraint business_files_size_is_bytes check (octet_length(bytes) = size) not valid;
--> statement-breakpoint
do $$
begin
  alter table business_files validate constraint business_files_size_is_bytes;
exception when check_violation then
  raise notice 'ekbill: a stored file''s size disagrees with its bytes; the check applies to new files only';
end $$;
--> statement-breakpoint
create or replace function refuse_file_change() returns trigger
  language plpgsql as $$
begin
  if new.bytes is distinct from old.bytes or new.sha256 is distinct from old.sha256 or new.mime is distinct from old.mime
     or new.kind is distinct from old.kind or new.business_id is distinct from old.business_id
     or new.size is distinct from old.size or new.id is distinct from old.id
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'ekbill: a stored file is never changed, add a new one' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
