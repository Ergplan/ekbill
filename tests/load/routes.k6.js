/* global __ENV, __ITER, __VU */
// k6 load test (Stage 10): the routes owners hit, against the budgets.
//
//   k6 run -e BASE=https://<host> -e SCALE=0.1 tests/load/routes.k6.js
//
// The people are the load seed's owners (+9170000NNNNN, see apps/worker/src/load/seed.ts),
// signed in through /dev/switch (AUTH_MODE=switcher during the build). SCALE 0.1 is the
// "whenever" run; SCALE 1 only when the operator says "go". Budgets (p95): Home 400 ms,
// the bill form 300 ms; a bill's PDF (rendered on the first ask) 3 s.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE || 'http://127.0.0.1:3000';
const SCALE = Number(__ENV.SCALE || '0.1');
const BUSINESSES = Math.max(1, Math.round(500 * SCALE));
const vus = (n) => Math.max(1, Math.round(n * SCALE));

export const options = {
  scenarios: {
    owners_making_bills: { executor: 'constant-vus', vus: vus(50), duration: '3m', exec: 'billForm' },
    reading_dues: { executor: 'constant-vus', vus: vus(200), duration: '3m', exec: 'dues' },
    rendering_pdfs: { executor: 'constant-vus', vus: vus(10), duration: '3m', exec: 'pdf' },
  },
  thresholds: {
    'http_req_duration{route:home}': ['p(95)<400'],
    'http_req_duration{route:bill-form}': ['p(95)<300'],
    'http_req_duration{route:dues}': ['p(95)<400'],
    'http_req_duration{route:pdf}': ['p(95)<3000'],
    http_req_failed: ['rate<0.01'],
  },
};

function phoneOf(n) {
  return `+9170000${String(n).padStart(5, '0')}`;
}

// Each VU signs in once as one of the seeded owners; the cookie jar keeps the session.
function signIn() {
  if (__ITER > 0) return;
  const n = ((__VU - 1) % BUSINESSES) + 1;
  const res = http.get(`${BASE}/dev/switch/${encodeURIComponent(phoneOf(n))}?to=/`, { tags: { route: 'sign-in' } });
  check(res, { 'signed in': (r) => r.status === 200 });
}

export function billForm() {
  signIn();
  check(http.get(`${BASE}/`, { tags: { route: 'home' } }), { home: (r) => r.status === 200 });
  check(http.get(`${BASE}/bills/new?new=1`, { tags: { route: 'bill-form' } }), { form: (r) => r.status === 200 });
  sleep(1);
}

export function dues() {
  signIn();
  check(http.get(`${BASE}/dues`, { tags: { route: 'dues' } }), { dues: (r) => r.status === 200 });
  check(http.get(`${BASE}/bills?filter=due`, { tags: { route: 'bills' } }), { bills: (r) => r.status === 200 });
  sleep(1);
}

export function pdf() {
  signIn();
  // The load seed numbers each business's bills LT-0001…; the first ask renders and keeps the PDF.
  const n = 1 + Math.floor(Math.random() * 30);
  const res = http.get(`${BASE}/api/documents/LT-${String(n).padStart(4, '0')}/file?kind=pdf&paper=a4`, {
    tags: { route: 'pdf' },
  });
  check(res, { pdf: (r) => r.status === 200 });
  sleep(2);
}
