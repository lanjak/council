import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { debateCommand, debateTurnCommand, debateAbortCommand } from '../../src/commands/debate.js';
import { loadConfig } from '../../src/config.js';
import { loadProvider } from '../../src/providers/index.js';
import { saveSession, loadSession, sessionPath } from '../../src/debate/session.js';
import type { DebateSession } from '../../src/types.js';

vi.mock('../../src/config.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadConfig: vi.fn(),
}));
vi.mock('../../src/providers/index.js', () => ({ loadProvider: vi.fn() }));

let dir: string;
let logs: string[];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'council-participate-'));
  process.env.XDG_STATE_HOME = dir;
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((s: string) => { logs.push(s); });
  vi.mocked(loadConfig).mockReturnValue({
    providers: {
      kimi: { name: 'kimi', displayName: 'Kimi', apiKey: 'k', baseURL: 'https://x/v1', model: 'kimi-m' },
      deepseek: { name: 'deepseek', displayName: 'DeepSeek', apiKey: 'k', baseURL: 'https://x/v1', model: 'ds-m' },
    },
  });
  vi.mocked(loadProvider).mockImplementation((name: string) => ({
    name,
    chat: vi.fn().mockResolvedValue({ content: `${name} position\nVERDICT: AGREE` }),
  }) as any);
});
afterEach(() => {
  delete process.env.XDG_STATE_HOME;
  fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function pendingSessionId(): string {
  const debatesDir = path.dirname(sessionPath('x'));
  const files = fs.readdirSync(debatesDir);
  expect(files).toHaveLength(1);
  return files[0].replace(/\.json$/, '');
}

describe('debate (caller always participates)', () => {
  it('pauses at the caller slot, persists the session, prints the instruction block', async () => {
    await debateCommand('q', {});
    const out = logs.join('\n');
    expect(out).toContain('status: awaiting-caller (round 1 of 5, turn 3 of 3)');
    expect(out).toContain('kimi position'); // unseen transcript shown in full
    const id = pendingSessionId();
    expect(out).toContain(`session: ${id}`);
    expect(loadSession(id).nextTurn).toEqual({ round: 1, participant: 'caller', order: ['kimi', 'deepseek', 'caller'] });
  });

  it('caller AGREE completes the debate, deletes the session, prints final output', async () => {
    await debateCommand('q', {});
    const id = pendingSessionId();
    logs = [];
    await debateTurnCommand(id, 'I agree with the council\nVERDICT: AGREE', {});
    const out = logs.join('\n');
    expect(out).toContain('consensus: reached in 1 of 5 rounds');
    expect(out).toContain('caller,caller,success,agree');
    expect(fs.existsSync(sessionPath(id))).toBe(false);
  });

  it('caller DISAGREE continues into round 2 and pauses at the caller again', async () => {
    await debateCommand('q', {});
    const id = pendingSessionId();
    logs = [];
    await debateTurnCommand(id, 'not convinced\nVERDICT: DISAGREE', {});
    const out = logs.join('\n');
    expect(out).toContain('status: awaiting-caller (round 2 of 5');
    expect(out).not.toContain('not convinced'); // own turn is not "unseen"
    const session = loadSession(id);
    expect(session.nextTurn.round).toBe(2);
    expect(session.turns.filter((t) => t.round === 2).length).toBeGreaterThan(0);
  });

  it('turn against an unknown session fails with SESSION_NOT_FOUND', async () => {
    await expect(debateTurnCommand('dbt-nope', 'x\nVERDICT: AGREE', {})).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

  it('turn when a judge is next fails with NOT_YOUR_TURN', async () => {
    const session: DebateSession = {
      id: 'dbt-judge1', createdAt: new Date().toISOString(), prompt: 'q',
      models: ['kimi', 'deepseek', 'caller'], maxRounds: 5, turns: [],
      nextTurn: { round: 1, participant: 'kimi', order: ['kimi', 'deepseek', 'caller'] },
    };
    saveSession(session);
    await expect(debateTurnCommand('dbt-judge1', 'x', {})).rejects.toMatchObject({ code: 'NOT_YOUR_TURN' });
  });

  it('requires exactly one of positional response and --stdin', async () => {
    await debateCommand('q', {});
    const id = pendingSessionId();
    await expect(debateTurnCommand(id, undefined, {})).rejects.toMatchObject({ code: 'BAD_ARG' });
  });

  it('abort is idempotent', async () => {
    await debateCommand('q', {});
    const id = pendingSessionId();
    await debateAbortCommand(id);
    expect(fs.existsSync(sessionPath(id))).toBe(false);
    await expect(debateAbortCommand(id)).resolves.toBeUndefined(); // no-op, no throw
  });

  it('two participating sessions stay independent', async () => {
    await debateCommand('q1', {});
    await debateCommand('q2', {});
    const debatesDir = path.dirname(sessionPath('x'));
    expect(fs.readdirSync(debatesDir)).toHaveLength(2);
  });
});

describe('debate --no-participate', () => {
  beforeEach(() => {
    vi.mocked(loadConfig).mockReturnValue({
      providers: {
        alpha: { name: 'alpha', displayName: 'Alpha', apiKey: 'k', baseURL: 'https://x/v1', model: 'alpha-m' },
        beta: { name: 'beta', displayName: 'Beta', apiKey: 'k', baseURL: 'https://x/v1', model: 'beta-m' },
      },
    });
  });

  it('excludes the caller from the roster and never pauses', async () => {
    // Two judges that agree immediately -> consensus in round 1, no caller turn.
    const agree = `I agree.\nVERDICT: AGREE`;
    vi.mocked(loadProvider).mockReturnValue({
      name: 'x',
      chat: vi.fn().mockResolvedValue({ content: agree }),
    } as any);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await debateCommand('settle this', { models: 'alpha,beta', participate: false });

    const printed = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).not.toContain('awaiting your turn');
    expect(printed).toContain('consensus: reached');
    expect(printed).toContain('judges: 2 of 2 responded');
    spy.mockRestore();
  });

  it('still defaults to participating when the flag is absent', async () => {
    const agree = `I agree.\nVERDICT: AGREE`;
    vi.mocked(loadProvider).mockReturnValue({
      name: 'x',
      chat: vi.fn().mockResolvedValue({ content: agree }),
    } as any);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await debateCommand('settle this', { models: 'alpha,beta' });

    expect(spy.mock.calls.map((c) => String(c[0])).join('\n')).toContain('awaiting your turn');
    spy.mockRestore();
  });

  it('still requires at least 2 judges without the caller to pad the roster', async () => {
    await expect(
      debateCommand('x', { models: 'alpha', participate: false })
    ).rejects.toThrow('A debate needs at least 2 judges');
  });

  it('does not treat a provider literally named caller as the caller', async () => {
    // 'caller' is a reserved participant name, not a provider key. With
    // --no-participate it must be filtered out of an explicit --models list,
    // leaving only 'alpha' - one judge, which trips the two-judge minimum.
    //
    // The throw IS the proof: had 'caller' been smuggled through as a provider,
    // the roster would have held 2 entries, cleared the minimum, and run.
    await expect(
      debateCommand('x', { models: 'alpha,caller', participate: false })
    ).rejects.toThrow('A debate needs at least 2 judges');
  });

  it('filters caller but still runs when two real judges remain', async () => {
    vi.mocked(loadProvider).mockReturnValue({
      name: 'x',
      chat: vi.fn().mockResolvedValue({ content: 'I agree.\nVERDICT: AGREE' }),
    } as any);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await debateCommand('x', { models: 'alpha,caller,beta', participate: false });

    const printed = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).not.toContain('awaiting your turn');
    // 2 judges, not 3 - 'caller' was filtered, and no caller joins the roster.
    expect(printed).toContain('judges: 2 of 2 responded');
    spy.mockRestore();
  });

  it('aborting a session that never existed is a no-op', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(debateAbortCommand('no-such-session')).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('taking a turn on a session that never existed fails cleanly', async () => {
    await expect(debateTurnCommand('no-such-session', 'my turn', {})).rejects.toThrow();
  });
});
