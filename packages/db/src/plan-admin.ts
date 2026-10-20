import { getPool } from './pool';

/**
 * The operator's side of EkBill's fee (20 Oct): the UPI payments owners have claimed, confirmed or rejected against
 * the bank statement, and complimentary months. Run by deploy/vm/payments.sh on the login role, outside any
 * tenant (it reads across businesses); every change is a plain update the audit trigger records as 'system'.
 */
export interface ClaimedPayment {
  id: string;
  business: string;
  phone: string | null;
  utr: string;
  amountPaise: number;
  periodStart: string;
  periodEnd: string;
  status: string;
  createdAt: string;
}

export async function listPayments(
  status: 'claimed' | 'confirmed' | 'rejected' | 'all' = 'claimed',
): Promise<ClaimedPayment[]> {
  const { rows } = await getPool().query<ClaimedPayment>(
    `select p.id, b.trade_name as business, b.phone, p.utr, p.amount_paise as "amountPaise",
            p.period_start::text as "periodStart", p.period_end::text as "periodEnd", p.status,
            to_char(p.created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as "createdAt"
       from plan_payments p join businesses b on b.id = p.business_id
      where $1 = 'all' or p.status = $1
      order by p.created_at`,
    [status],
  );
  return rows;
}

/**
 * Confirm or reject a claimed payment, found by its UTR. A rejected payment no longer counts, and the referral month
 * it used becomes usable again. Answers false when no claimed payment has that UTR.
 */
export async function decidePayment(
  utr: string,
  decision: 'confirmed' | 'rejected',
  note: string | null,
): Promise<boolean> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<{ id: string; business_id: string }>(
      "select id, business_id from plan_payments where utr = $1 and status = 'claimed' for update",
      [utr],
    );
    const row = rows[0];
    if (!row) {
      await client.query('rollback');
      return false;
    }
    await client.query(
      "select set_config('app.business_id', $1, true), set_config('app.actor_kind', 'system', true), set_config('app.request_id', 'operator-payments', true)",
      [row.business_id],
    );
    await client.query('update plan_payments set status = $2, decided_at = now(), decided_note = $3 where id = $1', [
      row.id,
      decision,
      note,
    ]);
    if (decision === 'rejected')
      await client.query('update referral_joins set used_payment_id = null where used_payment_id = $1', [row.id]);
    await client.query('commit');
    return true;
  } catch (e) {
    await client.query('rollback').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

/** No fee for a business until a date (a pilot, a friend of the house); null takes it away. */
export async function grantComp(businessPhoneOrId: string, until: string | null): Promise<number> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<{ id: string }>(
      "select id from businesses where (id::text = $1 or phone = $1) and status = 'active'",
      [businessPhoneOrId],
    );
    for (const r of rows) {
      await client.query(
        "select set_config('app.business_id', $1, true), set_config('app.actor_kind', 'system', true), set_config('app.request_id', 'operator-comp', true)",
        [r.id],
      );
      await client.query('update businesses set plan_comp_until = $2 where id = $1', [r.id, until]);
    }
    await client.query('commit');
    return rows.length;
  } catch (e) {
    await client.query('rollback').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
