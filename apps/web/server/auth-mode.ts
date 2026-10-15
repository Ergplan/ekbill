import 'server-only';

/**
 * AUTH_MODE: `switcher` (the build: /dev/switch issues sessions for the seeded
 * people, no password) or `otp` (Stage 10: phone + code; until then the OTP
 * route answers 501 and /dev/switch is gone). Anything else counts as otp,
 * the safe side.
 */
export type AuthMode = 'switcher' | 'otp';

export function authMode(env: NodeJS.ProcessEnv = process.env): AuthMode {
  return env.AUTH_MODE === 'switcher' ? 'switcher' : 'otp';
}
