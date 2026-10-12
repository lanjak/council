import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CouncilError } from '../errors.js';
import type { DebateSession } from '../types.js';

const TTL_MS = 24 * 60 * 60 * 1000;

export function newSessionId(): string {
  return `dbt-${crypto.randomBytes(3).toString('hex')}`;
}

export function sessionPath(id: string, env: NodeJS.ProcessEnv = process.env, project = 'council'): string {
  const base = env.XDG_STATE_HOME && env.XDG_STATE_HOME.length > 0
    ? env.XDG_STATE_HOME
    : path.join(os.homedir(), '.local', 'state');
  return path.join(base, project, 'debates', `${id.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`);
}

export function saveSession(session: DebateSession, env: NodeJS.ProcessEnv = process.env): void {
  const target = sessionPath(session.id, env);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const fd = fs.openSync(target, 'w');
  try {
    fs.writeSync(fd, JSON.stringify(session));
    fs.fsyncSync(fd); // durable before exit: the caller may resume from another process immediately
  } finally {
    fs.closeSync(fd);
  }
}

export function loadSession(id: string, env: NodeJS.ProcessEnv = process.env): DebateSession {
  const current = sessionPath(id, env);
  const target = fs.existsSync(current) ? current : sessionPath(id, env, 'council-axi');
  const notFound = new CouncilError(
    `Debate session "${id}" not found or expired. Start a new one with: council debate "<prompt>" --participate`,
    'SESSION_NOT_FOUND'
  );
  let raw: string;
  try {
    raw = fs.readFileSync(target, 'utf8');
  } catch {
    throw notFound;
  }
  let session: DebateSession;
  try {
    session = JSON.parse(raw) as DebateSession;
  } catch {
    fs.rmSync(target, { force: true });
    throw notFound;
  }
  const age = Date.now() - Date.parse(session.createdAt);
  if (!Number.isFinite(age) || age > TTL_MS) {
    fs.rmSync(target, { force: true });
    throw notFound;
  }
  return session;
}

export function deleteSession(id: string, env: NodeJS.ProcessEnv = process.env): void {
  fs.rmSync(sessionPath(id, env), { force: true });
  fs.rmSync(sessionPath(id, env, 'council-axi'), { force: true });
}

export function cleanupExpired(env: NodeJS.ProcessEnv = process.env): void {
  for (const project of ['council', 'council-axi']) {
    cleanupDirectory(path.dirname(sessionPath('x', env, project)));
  }
}

function cleanupDirectory(dir: string): void {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    try {
      const raw = fs.readFileSync(path.join(dir, name), 'utf8');
      const session = JSON.parse(raw) as DebateSession;
      const age = Date.now() - Date.parse(session.createdAt);
      if (!Number.isFinite(age) || age > TTL_MS) {
        fs.rmSync(path.join(dir, name), { force: true });
      }
    } catch {
      // best effort - never let cleanup break a command
    }
  }
}
