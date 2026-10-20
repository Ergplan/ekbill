import { getPool } from './pool';

/**
 * The demo's recordings (20 Oct): a line in a language, kept by its text's hash. No business and nothing personal,
 * so outside any tenant; written once (insert-only, the table refuses changes and deletes).
 */
export async function demoAudioOf(
  locale: string,
  lineId: string,
  textSha256: string,
): Promise<{ mime: string; bytes: Buffer } | null> {
  const { rows } = await getPool().query<{ mime: string; bytes: Buffer }>(
    'select mime, bytes from demo_audio where locale = $1 and line_id = $2 and text_sha256 = $3',
    [locale, lineId, textSha256],
  );
  return rows[0] ?? null;
}

export async function keepDemoAudio(row: {
  locale: string;
  lineId: string;
  textSha256: string;
  mime: string;
  bytes: Buffer;
}): Promise<void> {
  await getPool().query(
    `insert into demo_audio (locale, line_id, text_sha256, mime, bytes) values ($1, $2, $3, $4, $5)
     on conflict do nothing`,
    [row.locale, row.lineId, row.textSha256, row.mime, row.bytes],
  );
}

/** Which lines are recorded already, per language (the warm-up script and check-env say what is missing). */
export async function demoAudioCount(): Promise<number> {
  const { rows } = await getPool().query<{ n: string }>('select count(*) as n from demo_audio');
  return Number(rows[0]?.n ?? 0);
}
