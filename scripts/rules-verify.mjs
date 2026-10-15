#!/usr/bin/env node
// rules:verify (I5): fetch every entry's official source and look for the
// phrases the entry names (verify.mustContain, matched case-insensitively
// with whitespace collapsed). Found: the entry is marked verified with
// today's date and this machine as the verifier. Not found, or the page
// unreachable: the entry stays as it is and the URL is printed, for the
// operator to open. Run it where the official sites are reachable (the VM):
//   npm run rules:verify            # every unverified entry
//   npm run rules:verify -- --all   # re-check verified entries too
//   npm run rules:verify -- --dry   # report only, write nothing
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'packages/engine/rules/gst');
const args = process.argv.slice(2);
const all = args.includes('--all');
const dry = args.includes('--dry');
const today = new Date().toISOString().slice(0, 10);

const norm = (s) => s.replace(/\s+/g, ' ').toLowerCase();
const cache = new Map();
async function page(url) {
  if (cache.has(url)) return cache.get(url);
  let text = null;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: globalThis.AbortSignal.timeout(30_000),
      headers: { 'user-agent': 'ekbill-rules-verify' },
    });
    if (res.ok) text = norm((await res.text()).replace(/<[^>]+>/g, ' '));
    else console.error(`  ${url}: HTTP ${res.status}`);
  } catch (error) {
    console.error(`  ${url}: ${error.message}`);
  }
  cache.set(url, text);
  return text;
}

let checked = 0;
let verified = 0;
const failed = [];
for (const file of readdirSync(DIR)
  .filter((f) => f.endsWith('.json') && f !== 'hsn-index.json')
  .sort()) {
  const path = join(DIR, file);
  const pack = JSON.parse(readFileSync(path, 'utf8'));
  let changed = false;
  for (const entry of pack.entries) {
    if (entry.verified && !all) continue;
    checked += 1;
    const text = await page(entry.source);
    const missing = text ? entry.verify.mustContain.filter((p) => !text.includes(norm(p))) : entry.verify.mustContain;
    if (text && missing.length === 0) {
      verified += 1;
      if (!dry) {
        entry.verified = true;
        entry.verifiedOn = today;
        entry.verifiedBy = `rules:verify on ${hostname()}: fetched ${entry.source}, found ${entry.verify.mustContain.map((p) => JSON.stringify(p)).join(', ')}`;
        changed = true;
      }
      console.log(`ok   ${file}: ${entry.id}`);
    } else {
      failed.push(
        `${file}: ${entry.id} — ${entry.source}${text ? ` (not found: ${missing.join(' | ')})` : ' (unreachable)'}`,
      );
      console.log(`FAIL ${file}: ${entry.id}`);
    }
  }
  if (changed) writeFileSync(path, `${JSON.stringify(pack, null, 2)}\n`);
}
// The HSN index: refresh its fetch date when its sources answer.
const indexPath = join(DIR, 'hsn-index.json');
const index = JSON.parse(readFileSync(indexPath, 'utf8'));
if (all || !index.fetched) {
  const ok = (await Promise.all(index.sources.map((s) => page(s.url)))).every(Boolean);
  if (ok && !dry) {
    index.fetched = true;
    index.fetchedOn = today;
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    console.log('ok   hsn-index.json: sources reachable, fetch date recorded');
  } else if (!ok) failed.push('hsn-index.json: a source was unreachable');
}
console.log(`rules:verify: ${verified}/${checked} verified${dry ? ' (dry: nothing written)' : ''}`);
if (failed.length) {
  console.error('Still unverified (open the URL and check by hand, then set verified/verifiedOn/verifiedBy):');
  for (const f of failed) console.error(`  ${f}`);
  process.exit(1);
}
