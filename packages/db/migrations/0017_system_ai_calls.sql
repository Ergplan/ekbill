-- The app demo's recordings (20 Oct, the operator: "in demo some weird voice is there"). A line recorded for a visitor
-- who is not signed in, or by the warm-up after a deploy, is EkBill's own call: no business, no person. The policy
-- of 0010 let such a row in only for a person (user_id = app.user_id), so every one was refused, no line was kept,
-- and the demo fell back to the phone's own voice. Now a row with no business and no person may be written, and
-- read, by the system actor alone.
drop policy tenant_isolation on ai_calls;--> statement-breakpoint
create policy tenant_isolation on ai_calls
  using (
    business_id = app_business_id()
    or (business_id is null and user_id::text = app_setting('app.user_id'))
    or (business_id is null and user_id is null and app_setting('app.actor_kind') = 'system')
  )
  with check (
    business_id = app_business_id()
    or (business_id is null and user_id::text = app_setting('app.user_id'))
    or (business_id is null and user_id is null and app_setting('app.actor_kind') = 'system')
  );
