// from mvp-final: tests/unit/tax-engine.test.ts (the GSTIN block)
import { describe, expect, it } from 'vitest';

import { checkGstin, checkPan, gstinCheckDigit } from '../../packages/engine/src/ids';

describe('GSTIN validation', () => {
  it('accepts a well-formed GSTIN and derives its state', () => {
    const r = checkGstin('27AAPFU0939F1ZV');
    expect(r.ok).toBe(true);
    expect(r.stateCode).toBe('27');
    expect(r.stateName).toBe('Maharashtra');
    expect(r.pan).toBe('AAPFU0939F');
  });

  it('catches a single-character typo through the check digit', () => {
    expect(checkGstin('27AAPFU0939F1ZX').problem).toBe('checksum');
  });

  it('rejects an unknown state code and a wrong length', () => {
    expect(checkGstin('99AAPFU0939F1ZV').problem).toBe('unknown-state');
    expect(checkGstin('27AAPFU0939F1Z').problem).toBe('length');
  });

  it('computes check digits consistently', () => {
    expect(gstinCheckDigit('27AAPFU0939F1Z')).toBe('V');
  });
});

describe('PAN', () => {
  it('accepts the shape ABCDE1234F and normalises case and spaces', () => {
    expect(checkPan(' aaapu0939f ')).toEqual({ ok: true, normalised: 'AAAPU0939F' });
  });
  it('rejects the wrong shape with a message the owner can act on', () => {
    expect(checkPan('AAAP0939F').ok).toBe(false);
    expect(checkPan('').message).toBe('Enter a PAN');
  });
});
