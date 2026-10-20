/**
 * The operator's view of EkBill's fee (20 Oct), run on the VM by deploy/vm/payments.sh (inside the app container):
 *
 *   list [claimed|confirmed|rejected|all]   the UPI payments owners have said they made
 *   confirm <UTR> [note]                     the money is in the bank statement
 *   reject <UTR> [note]                      it is not: the month stops counting, a used referral comes back
 *   comp <business phone or id> <YYYY-MM-DD|none>   no fee until that date (none takes it away)
 */
import { closePool, decidePayment, grantComp, listPayments } from '@ekbill/db';

const [cmd, a, ...rest] = process.argv.slice(2);
const rupees = (p) => `₹${(p / 100).toFixed(2)}`;

try {
  if (!cmd || cmd === 'list') {
    const rows = await listPayments(a ?? 'claimed');
    if (!rows.length) console.log(a === 'all' ? 'no payments yet' : `no ${a ?? 'claimed'} payments`);
    for (const r of rows)
      console.log(
        `${r.createdAt}  ${r.status.padEnd(9)}  UTR ${r.utr}  ${rupees(r.amountPaise).padStart(7)}  ${r.periodStart}..${r.periodEnd}  ${r.business}${r.phone ? ` (${r.phone})` : ''}`,
      );
  } else if (cmd === 'confirm' || cmd === 'reject') {
    if (!/^\d{12}$/.test(a ?? '')) throw new Error('give the 12-digit UTR');
    const done = await decidePayment(a, cmd === 'confirm' ? 'confirmed' : 'rejected', rest.join(' ') || null);
    console.log(done ? `${cmd}ed: UTR ${a}` : `no claimed payment with UTR ${a}`);
  } else if (cmd === 'comp') {
    const until = rest[0] === 'none' ? null : rest[0];
    if (!a || (until !== null && !/^\d{4}-\d{2}-\d{2}$/.test(until ?? '')))
      throw new Error('comp <phone or id> <YYYY-MM-DD|none>');
    const n = await grantComp(a, until);
    console.log(
      n
        ? `${n} business(es): no fee ${until ? `until ${until}` : 'any more (comp removed)'}`
        : 'no active business with that phone or id',
    );
  } else {
    throw new Error(`unknown command ${cmd}: list | confirm | reject | comp`);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await closePool();
}
