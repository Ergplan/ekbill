-- The Stage 2 review (rule 12).
-- A model may not change a person's settings (I6): users get the same refusal as the business tables.
create trigger refuse_model_actor before insert or update on users for each row execute function refuse_model_actor();--> statement-breakpoint
-- A model call outside a business (a new owner's setup) is that person's: no other session reads or writes it.
drop policy tenant_isolation on ai_calls;--> statement-breakpoint
create policy tenant_isolation on ai_calls
  using (business_id = app_business_id() or (business_id is null and user_id::text = app_setting('app.user_id')))
  with check (business_id = app_business_id() or (business_id is null and user_id::text = app_setting('app.user_id')));
