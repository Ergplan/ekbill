import 'server-only';

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

import type { Verifier } from './otp';

/**
 * Firebase Admin for phone OTP (Stage 10). On the VM it runs as the VM's service account
 * (application default credentials; the operator grants it Firebase Authentication Admin, the agent
 * never changes IAM); no key file anywhere. In CI FIREBASE_AUTH_EMULATOR_HOST points it at the
 * emulator. Verifying an ID token needs only the project: the signature, audience, issuer and expiry.
 */
export function firebaseVerifier(): Verifier {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is not set');
  const app =
    getApps()[0] ??
    initializeApp(
      process.env.FIREBASE_AUTH_EMULATOR_HOST ? { projectId } : { projectId, credential: applicationDefault() },
    );
  const auth = getAuth(app);
  return async (idToken) => {
    const d = await auth.verifyIdToken(idToken);
    return { uid: d.uid, phone_number: d.phone_number, auth_time: d.auth_time };
  };
}
