-- packages/db/tenancy.sql — the tenancy toolkit (I1, I6, I7), included by a
-- migration with the line "-- include tenancy.sql" (migrate.mjs inlines it).
-- Re-include it from a later migration when a function here changes: the
-- functions are "create or replace", the role and grants idempotent.
--
--   apply_tenancy(tbl, with_rls, business_column)
--     with_rls: row-level security on business_column = app_business_id(),
--               forced (the table owner is bound too);
--     always:   the audit trigger (one audit_events row per insert/update,
--               before and after, actor and request from the session settings),
--               the delete refusal (8.3: nobody deletes, archive instead),
--               the model-actor refusal (I6: app.actor_kind = 'model' may not
--               write an authoritative table).
--
-- The app runs every scoped transaction as the role ekbill_app (withTenant:
-- SET LOCAL ROLE), which owns nothing, so RLS binds it; the login role that
-- migrates owns the tables and is bound by FORCE. audit_events is written
-- only by the audit trigger (security definer): ekbill_app may read, never
-- insert, update or delete.

create or replace function app_setting(name text) returns text
  language sql stable as $$ select nullif(current_setting(name, true), '') $$;

create or replace function app_business_id() returns uuid
  language sql stable as $$ select app_setting('app.business_id')::uuid $$;

create or replace function audit_row() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  biz uuid;
  before_j jsonb;
  after_j jsonb;
begin
  if tg_op = 'INSERT' then
    after_j := to_jsonb(new);
  else
    before_j := to_jsonb(old);
    after_j := to_jsonb(new);
  end if;
  if tg_table_name = 'businesses' then biz := new.id; else biz := (after_j->>'business_id')::uuid; end if;
  insert into audit_events (business_id, actor_user_id, actor_kind, table_name, row_id, action, before, after, request_id)
  values (
    biz,
    app_setting('app.user_id')::uuid,
    coalesce(app_setting('app.actor_kind'), 'user'),
    tg_table_name,
    after_j->>'id',
    tg_op,
    before_j,
    after_j,
    app_setting('app.request_id')
  );
  return new;
end $$;

create or replace function refuse_delete() returns trigger
  language plpgsql as $$
begin
  raise exception 'ekbill: nothing is deleted from % (archive it instead)', tg_table_name
    using errcode = 'insufficient_privilege';
end $$;

create or replace function refuse_model_actor() returns trigger
  language plpgsql as $$
begin
  if app_setting('app.actor_kind') = 'model' then
    raise exception 'ekbill: a model may not write % (I6: model output lands in staging only)', tg_table_name
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create or replace function refuse_change() returns trigger
  language plpgsql as $$
begin
  raise exception 'ekbill: % is append-only', tg_table_name using errcode = 'insufficient_privilege';
end $$;

create or replace function apply_tenancy(tbl regclass, with_rls boolean default true, business_column text default 'business_id')
  returns void language plpgsql as $$
begin
  if with_rls then
    execute format('alter table %s enable row level security', tbl);
    execute format('alter table %s force row level security', tbl);
    execute format('drop policy if exists tenant_isolation on %s', tbl);
    execute format(
      'create policy tenant_isolation on %s using (%I = app_business_id()) with check (%I = app_business_id())',
      tbl, business_column, business_column
    );
  end if;
  execute format('drop trigger if exists audit on %s', tbl);
  execute format('create trigger audit after insert or update on %s for each row execute function audit_row()', tbl);
  execute format('drop trigger if exists refuse_delete on %s', tbl);
  execute format('create trigger refuse_delete before delete on %s for each row execute function refuse_delete()', tbl);
  execute format('drop trigger if exists refuse_model_actor on %s', tbl);
  execute format(
    'create trigger refuse_model_actor before insert or update on %s for each row execute function refuse_model_actor()', tbl
  );
end $$;

-- The application role: no login, owns nothing; the login role is a member of it so withTenant can SET LOCAL ROLE.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ekbill_app') then
    create role ekbill_app nologin;
  end if;
  execute format('grant ekbill_app to %I', current_user);
end $$;
grant usage on schema public to ekbill_app;
