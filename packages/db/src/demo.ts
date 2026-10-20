/**
 * The app demo's version (20 Oct). A person whose users.demo_seen_version is below it is offered the demo once:
 * the welcome for a new sign-up, "naya kya hai" for someone already billing. Raise it when the demo changes.
 * Its own module: the seed (plain Node) reads it, and auth.ts is server-only.
 */
export const DEMO_VERSION = 1;
