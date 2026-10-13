import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import {
  buildReviewPrompt,
  loadEnv,
  nextReviewPath,
  parseVerdict,
  reviewStage,
  stagePrompt,
} from '../../scripts/review-stage.mjs';

const MASTER = `# prompt

### Stage 0 — Ground

\`\`\`
### Stage 0 — Ground

\`\`\`
Stage 0: do the ground work.
Done when: everything. STOP.
\`\`\`

### Stage 1 — Screen flow (approval gate)

\`\`\`
Stage 1: design the screens.
\`\`\`

## 8. Reference
`;

describe('stagePrompt', () => {
  it('returns the fenced block for the stage, keeping a nested fence as text', () => {
    expect(stagePrompt(MASTER, 0)).toContain('Stage 0: do the ground work.');
    expect(stagePrompt(MASTER, 0)).toContain('Done when: everything. STOP.');
    expect(stagePrompt(MASTER, 0)).not.toContain('Stage 1:');
  });
  it('finds a later stage', () => {
    expect(stagePrompt(MASTER, 1)).toBe('Stage 1: design the screens.');
  });
  it('fails loudly for a stage that is not there', () => {
    expect(() => stagePrompt(MASTER, 7)).toThrow(/no "### Stage 7/);
  });
});

describe('buildReviewPrompt', () => {
  it('sends exactly the four labelled inputs and the checklist', () => {
    const { system, user } = buildReviewPrompt({
      stage: 3,
      diff: 'DIFF',
      claudeMd: 'RULES',
      prompt: 'PROMPT',
      report: 'REPORT',
    });
    expect(system).toContain('VERDICT: no new code defect');
    expect(user.match(/===== INPUT \d/g)).toHaveLength(4);
    expect(user).toContain('INPUT 1: STAGE DIFF');
    expect(user).toContain('INPUT 2: CLAUDE.md');
    expect(user).toContain('INPUT 3: STAGE PROMPT');
    expect(user).toContain('INPUT 4: STAGE REPORT');
    for (const marker of ['DIFF', 'RULES', 'PROMPT', 'REPORT']) expect(user).toContain(marker);
  });
});

describe('parseVerdict', () => {
  it('reads the one verdict line', () => {
    expect(parseVerdict('...\nVERDICT: no new code defect')).toBe('clean');
    expect(parseVerdict('VERDICT: defects found\n')).toBe('defects');
    expect(parseVerdict('I am not sure')).toBe('unclear');
  });
});

describe('reviewStage with a stubbed model', () => {
  function repo() {
    const root = mkdtempSync(join(tmpdir(), 'ekbill-review-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@ekbill.local');
    git('config', 'user.name', 'test');
    mkdirSync(join(root, 'docs', 'stages'), { recursive: true });
    writeFileSync(join(root, 'docs', 'MASTER-PROMPT.md'), MASTER);
    writeFileSync(join(root, 'CLAUDE.md'), '# rules\n');
    writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
    git('add', '.');
    git('commit', '-q', '-m', 'start');
    git('tag', 'stage-1-start');
    writeFileSync(join(root, 'a.ts'), 'export const a = 2;\n');
    writeFileSync(join(root, 'docs', 'stages', 'stage-1-report.md'), '# Stage 1 report\nAll good.\n');
    git('add', '.');
    git('commit', '-q', '-m', 'work');
    return root;
  }

  it('writes stage-N-review-k.md with the verdict and passes the four inputs to the model', async () => {
    const root = repo();
    const seen: Array<{ model: string; system: string; user: string }> = [];
    const call = async (args: { model: string; system: string; user: string }) => {
      seen.push(args);
      return 'Checklist (a) fine.\nVERDICT: no new code defect';
    };
    const env = { OPENAI_REVIEW_API_KEY: 'sk-test', OPENAI_REVIEW_MODEL: 'review-model-x' };
    const first = await reviewStage(1, { root, call, env });
    expect(first.verdict).toBe('clean');
    expect(first.path).toBe(join(root, 'docs', 'stages', 'stage-1-review-1.md'));
    const written = readFileSync(first.path as string, 'utf8');
    expect(written).toContain('Model: review-model-x');
    expect(written).toContain('VERDICT: no new code defect');
    expect(seen[0]?.model).toBe('review-model-x');
    expect(seen[0]?.user).toContain('-export const a = 1;');
    expect(seen[0]?.user).toContain('+export const a = 2;');
    expect(seen[0]?.user).toContain('Stage 1: design the screens.');
    expect(seen[0]?.user).toContain('All good.');
    expect(seen[0]?.user).toContain('# rules');

    const second = await reviewStage(1, { root, call: async () => 'VERDICT: defects found', env });
    expect(second.verdict).toBe('defects');
    expect(nextReviewPath(1, root)).toBe(join(root, 'docs', 'stages', 'stage-1-review-3.md'));
  });

  it('refuses without a committed report or without the keys', async () => {
    const root = repo();
    await expect(reviewStage(2, { root, env: {} })).rejects.toThrow(/stage-2-report.md does not exist/);
    await expect(reviewStage(1, { root, env: {} })).rejects.toThrow(/OPENAI_REVIEW_API_KEY/);
    await expect(reviewStage(1, { root, env: { OPENAI_REVIEW_API_KEY: 'x' } })).rejects.toThrow(/OPENAI_REVIEW_MODEL/);
  });

  it('a dry run builds the prompt and calls nothing', async () => {
    const root = repo();
    const result = await reviewStage(1, { root, env: {}, dry: true, call: async () => 'never' });
    expect(result.verdict).toBe('dry');
    expect(result.size).toBeGreaterThan(100);
  });
});

describe('loadEnv', () => {
  it('reads .env without quotes and lets the environment win', () => {
    const root = mkdtempSync(join(tmpdir(), 'ekbill-env-'));
    writeFileSync(join(root, '.env'), '# comment\nOPENAI_REVIEW_MODEL="m-1"\nEMPTY=\nPATH=should-not-win\n');
    const env = loadEnv(root);
    expect(env.OPENAI_REVIEW_MODEL).toBe('m-1');
    expect(env.EMPTY).toBe('');
    expect(env.PATH).toBe(process.env.PATH);
  });
});
