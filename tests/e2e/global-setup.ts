import { seedBuild } from '../../packages/db/src/seed';

/** The browser journeys need the build's people in the database the server uses (the switcher issues their sessions). */
export default async function globalSetup() {
  const url = process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5440/ekbill2_dev';
  await seedBuild(url, { log: () => undefined });
}
