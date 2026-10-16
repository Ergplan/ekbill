#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
// A small load run without k6 (Stage 10): virtual owners of the load-test businesses sign in
// through /dev/switch and walk Home, the bill form, the dues and the bills list for a while;
// p50 and p95 per route against the budgets. k6 (tests/load/routes.k6.js) is the real run;
// this is what the build container can do (k6 is not installable here) and a quick check on
// the VM.
//
//   node tests/load/measure.mjs --base http://127.0.0.1:3000 --users 20 --businesses 50 --seconds 60
const arg = (name, d) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg('base', 'http://127.0.0.1:3000');
const USERS = Number(arg('users', '20'));
const BUSINESSES = Number(arg('businesses', '50'));
const SECONDS = Number(arg('seconds', '60'));
const BUDGET = { home: 400, 'bill-form': 300, dues: 400, bills: 400 };
const ROUTES = [
  ['home', '/'],
  ['bill-form', '/bills/new?new=1'],
  ['dues', '/dues'],
  ['bills', '/bills'],
];

const phoneOf = (n) => `+9170000${String(n).padStart(5, '0')}`;
const times = Object.fromEntries(ROUTES.map(([r]) => [r, []]));
let failures = 0;

async function signIn(n) {
  const res = await fetch(`${BASE}/dev/switch/${encodeURIComponent(phoneOf(n))}?to=/`, { redirect: 'manual' });
  const cookie = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .filter((c) => c.startsWith('eb-'))
    .join('; ');
  if (!cookie.includes('eb-session=')) throw new Error(`sign-in failed for ${phoneOf(n)}: ${res.status}`);
  return cookie;
}

async function user(i, until) {
  const cookie = await signIn((i % BUSINESSES) + 1);
  while (Date.now() < until) {
    for (const [route, path] of ROUTES) {
      const t0 = performance.now();
      const res = await fetch(`${BASE}${path}`, { headers: { cookie } });
      await res.arrayBuffer();
      times[route].push(performance.now() - t0);
      if (res.status !== 200) failures += 1;
    }
  }
}

const pct = (xs, p) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

const until = Date.now() + SECONDS * 1000;
await Promise.all(Array.from({ length: USERS }, (_, i) => user(i, until)));
let over = 0;
console.log(`route        n      p50     p95   budget (p95)   ${USERS} users, ${BUSINESSES} businesses, ${SECONDS} s`);
for (const [route] of ROUTES) {
  const p95 = pct(times[route], 95);
  const ok = p95 <= BUDGET[route];
  if (!ok) over += 1;
  console.log(
    `${route.padEnd(10)} ${String(times[route].length).padStart(5)} ${pct(times[route], 50).toFixed(0).padStart(6)}ms ${p95
      .toFixed(0)
      .padStart(6)}ms   ${String(BUDGET[route]).padStart(5)}ms ${ok ? 'ok' : 'OVER'}`,
  );
}
console.log(`failed requests: ${failures}`);
process.exit(over || failures ? 1 : 0);
