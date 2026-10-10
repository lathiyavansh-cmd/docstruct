import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  /** Origin of the web client: CORS allow-list and the base of password-reset links. */
  appUrl: string;
  /** Prefix signed storage URLs are built on. Relative by default so the dev proxy serves them. */
  publicApiBase: string;
  dataDir: string;
  /** PostgreSQL connection string. Empty -> embedded PGlite in dataDir; 'memory://' -> in-memory. */
  databaseUrl: string;
  /** Directory of the object store (uploaded files). */
  storageDir: string;
  /** HMAC secret for signed storage URLs. */
  signingSecret: string;
  /** Appendix C TBD resolved: session and signed-URL validity periods. */
  sessionIdleMinutes: number;
  sessionMaxHours: number;
  signedUrlTtlSeconds: number;
  resetTokenMinutes: number;
  extractor: { driver: 'python' | 'builtin'; pythonBin: string; timeoutMs: number };
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

/** A development secret persisted in the data directory so signed URLs survive restarts. */
function devSecret(dataDir: string): string {
  const file = path.join(dataDir, 'signing-secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  mkdirSync(dataDir, { recursive: true });
  const secret = randomBytes(32).toString('hex');
  writeFileSync(file, secret);
  return secret;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const env = (process.env.NODE_ENV as AppConfig['env']) ?? 'development';
  const dataDir = path.resolve(overrides.dataDir ?? process.env.DATA_DIR ?? '.data');

  let signingSecret = overrides.signingSecret ?? process.env.SIGNING_SECRET ?? '';
  if (!signingSecret) {
    if (env === 'production') throw new Error('SIGNING_SECRET is required in production');
    signingSecret = env === 'test' ? 'test-secret' : devSecret(dataDir);
  }

  const { dataDir: _d, signingSecret: _s, ...rest } = overrides;
  overrides = rest;
  return {
    env,
    port: intEnv('PORT', 4000),
    appUrl: process.env.APP_URL ?? 'http://localhost:5173',
    publicApiBase: process.env.PUBLIC_API_BASE ?? '/api',
    dataDir,
    databaseUrl: process.env.DATABASE_URL ?? '',
    storageDir: path.resolve(process.env.STORAGE_DIR ?? path.join(dataDir, 'objects')),
    signingSecret,
    sessionIdleMinutes: intEnv('SESSION_IDLE_MINUTES', 30),
    sessionMaxHours: intEnv('SESSION_MAX_HOURS', 12),
    signedUrlTtlSeconds: intEnv('SIGNED_URL_TTL_SECONDS', 300),
    resetTokenMinutes: intEnv('RESET_TOKEN_MINUTES', 30),
    extractor: {
      driver: (process.env.EXTRACTOR ?? 'python') as AppConfig['extractor']['driver'],
      pythonBin: process.env.PYTHON_BIN ?? (process.platform === 'win32' ? 'py' : 'python3'),
      timeoutMs: intEnv('EXTRACTOR_TIMEOUT_MS', 20_000),
    },
    ...overrides,
  };
}
