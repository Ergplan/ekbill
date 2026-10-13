/**
 * @ekbill/engine: the pure heart of EkBill.
 *
 * Nothing in this package touches I/O: no database, no model, no clock, no
 * randomness (invariant I4; enforced by eslint). Dates and the GST rule pack
 * are passed in. Stage 1 adds the identity and money checks copied from the
 * MVP; Stage 3 completes the package.
 */
export const ENGINE_VERSION = '2.0.0-dev';
