import { it, expect, vi, afterEach } from 'vitest';
import { reviewCommand } from '../../src/commands/review.js';
import { planCommand } from '../../src/commands/plan.js';
import { debateCommand, debateTurnCommand } from '../../src/commands/debate.js';
import { loadProvider } from '../../src/providers/index.js';
import { loadSession, deleteSession, sessionPath } from '../../src/debate/session.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('../../src/providers/index.js', () => ({ loadProvider: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); process.exitCode = 0; });
function setup() {
  vi.stubEnv('COUNCIL_PROVIDERS', 'a,b');
  for (const prefix of ['A', 'B']) {
    vi.stubEnv(`${prefix}_API_KEY`, 'key');
    vi.stubEnv(`${prefix}_MODEL`, 'model');
    vi.stubEnv(`${prefix}_EFFORT`, 'low');
    vi.stubEnv(`${prefix}_MAX_TOKENS`, '900');
  }
  const chat = vi.fn().mockResolvedValue({ content: 'fine\nVERDICT: DISAGREE' });
  vi.mocked(loadProvider).mockReturnValue({ chat } as any);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  return chat;
}
it.each(['review', 'plan', 'debate'] as const)('%s flags override env at the provider call', async (mode) => {
  const chat = setup();
  if (mode === 'debate') await debateCommand('q', { maxTokens: '1234', effort: 'high', maxRounds: '1', participate: false });
  else await (mode === 'review' ? reviewCommand : planCommand)('q', { maxTokens: '1234', effort: 'high' });
  expect(chat).toHaveBeenCalledTimes(2);
  for (const [call] of chat.mock.calls) expect(call).toMatchObject({ maxTokens: 1234, effort: 'high' });
});
it.each(['0', '-1', '1.5', '2x', 'NaN', '9007199254740992'])('rejects invalid token flag %s before calls', async (maxTokens) => {
  const chat = setup();
  for (const command of [reviewCommand, planCommand, debateCommand]) {
    await expect(command('q', { maxTokens })).rejects.toMatchObject({ code: 'BAD_ARG' });
  }
  expect(chat).not.toHaveBeenCalled();
});
it('rejects invalid effort flags before calls', async () => {
  const chat = setup();
  for (const command of [reviewCommand, planCommand, debateCommand]) {
    await expect(command('q', { effort: 'maximum' })).rejects.toThrow(/--effort.*low\|medium\|high\|xhigh/);
  }
  expect(chat).not.toHaveBeenCalled();
});
it('retains controls through a paused and resumed debate', async () => {
  const chat = setup();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'council-controls-'));
  vi.stubEnv('XDG_STATE_HOME', dir);
  try {
    await debateCommand('q', { maxTokens: '1234', effort: 'high', maxRounds: '2' });
    const name = fs.readdirSync(path.join(dir, 'council', 'debates'))[0];
    const id = name.replace(/\.json$/, '');
    expect(loadSession(id)).toMatchObject({ maxTokens: 1234, effort: 'high' });
    chat.mockClear();
    await debateTurnCommand(id, 'VERDICT: DISAGREE', {});
    expect(chat).toHaveBeenCalled();
    for (const [call] of chat.mock.calls) expect(call).toMatchObject({ maxTokens: 1234, effort: 'high' });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
it('loads legacy sessions, prefers current sessions, and deletes both', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'council-legacy-'));
  const env = { XDG_STATE_HOME: dir };
  const legacy = path.join(dir, 'council-axi', 'debates', 'dbt-test.json');
  const session = { id: 'dbt-test', createdAt: new Date().toISOString(), prompt: 'legacy' };
  try {
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, JSON.stringify(session));
    expect(loadSession(session.id, env).prompt).toBe('legacy');
    const current = sessionPath(session.id, env);
    expect(current).toContain('/council/debates/');
    fs.mkdirSync(path.dirname(current), { recursive: true });
    fs.writeFileSync(current, JSON.stringify({ ...session, prompt: 'current' }));
    expect(loadSession(session.id, env).prompt).toBe('current');
    deleteSession(session.id, env);
    expect(fs.existsSync(current)).toBe(false);
    expect(fs.existsSync(legacy)).toBe(false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
