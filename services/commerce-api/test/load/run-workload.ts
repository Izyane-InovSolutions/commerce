/**
 * Open-loop HTTP workload for the Stage 6 baseline. Requests are issued at a
 * fixed rate whatever the response times, so slow responses show up as
 * latency instead of silently lowering the offered load.
 *
 *   LOAD_BASE_URL=http://127.0.0.1:3100/api/v1 LOAD_RPS=100 \
 *   LOAD_DURATION_S=600 npx ts-node test/load/run-workload.ts
 *
 * Expects a dataset from seed-synthetic-data.ts. Every request sends an
 * X-Forwarded-For from the 198.18.0.0/15 benchmarking range: the API trusts
 * loopback proxies, so each synthetic client is throttled as its own address,
 * the way distinct visitors behind the production proxy are.
 *
 * Checkout uses POST /checkout/buy-now against PAYMENTS_PROVIDER=pending,
 * a deterministic stub that rejects initialization with 503 after the order
 * and reservation are created; the API then cancels the order and releases
 * stock. That 503 is the expected outcome and is not counted as an error.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import {
  LOAD_ADMIN_EMAIL,
  LOAD_PASSWORD,
  loadUserEmail,
} from './seed-synthetic-data';

const env = (name: string, fallback: number): number => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${name} must be a positive number`);
  return value;
};

const config = {
  baseUrl: process.env.LOAD_BASE_URL ?? 'http://127.0.0.1:3100/api/v1',
  rps: env('LOAD_RPS', 100),
  durationS: env('LOAD_DURATION_S', 600),
  warmupS: env('LOAD_WARMUP_S', 60),
  poolUsers: env('LOAD_POOL_USERS', 200),
  datasetUsers: env('LOAD_USERS', 100_000),
  datasetVariants: env('LOAD_VARIANTS', 100_000),
  maxInFlight: env('LOAD_MAX_IN_FLIGHT', 2_000),
  timeoutMs: env('LOAD_TIMEOUT_MS', 10_000),
  sampleEveryS: env('LOAD_SAMPLE_EVERY_S', 5),
  seed: env('LOAD_SEED', 20261002),
  output: resolve(
    process.env.LOAD_OUTPUT ?? 'load-results/workload-result.json',
  ),
  seedReport: process.env.LOAD_SEED_REPORT,
  // Which classes run; the default is the full mix.
  only: process.env.LOAD_ONLY?.split(',').filter(Boolean),
};
const products = Math.ceil(config.datasetVariants / 2);

// Deterministic PRNG (mulberry32) so a run's request sequence is repeatable.
let state = config.seed >>> 0;
function random(): number {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(items: readonly T[]): T =>
  items[Math.floor(random() * items.length)] as T;
const between = (min: number, max: number): number =>
  min + Math.floor(random() * (max - min + 1));
/** Cubic skew toward low numbers: the seed's best sellers. */
const skewed = (max: number): number =>
  1 + Math.floor((max - 1) * Math.pow(random(), 3));
const clientIp = (n: number): string =>
  `198.18.${Math.floor(n / 250) % 256}.${1 + (n % 250)}`;

type Result = { status: number; ms: number; body?: unknown; error?: string };

async function call(
  method: string,
  path: string,
  options: {
    token?: string;
    body?: unknown;
    ip: string;
    headers?: Record<string, string>;
    parse?: boolean;
    timeoutMs?: number;
  },
): Promise<Result> {
  const startedAt = performance.now();
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers: {
        'x-forwarded-for': options.ip,
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs ?? config.timeoutMs),
    });
    const text = await response.text();
    const ms = performance.now() - startedAt;
    let body: unknown;
    if (options.parse && text) {
      try {
        body = (JSON.parse(text) as { data?: unknown }).data;
      } catch {
        body = undefined;
      }
    }
    return { status: response.status, ms, body };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    // 0 = network error, 1 = client timeout; both are unexpected errors.
    // undici reports the socket failure (ECONNREFUSED, ECONNRESET, ...) as the cause.
    const cause = (error as { cause?: { code?: string } }).cause;
    return {
      status: timedOut ? 1 : 0,
      ms: performance.now() - startedAt,
      error: timedOut
        ? 'TIMEOUT'
        : (cause?.code ?? (error instanceof Error ? error.name : 'unknown')),
    };
  }
}

type VirtualUser = {
  n: number;
  ip: string;
  token: string;
  addressId: string;
  orderIds: string[];
  cartItemIds: string[];
};

type Op = {
  name: string;
  group: 'catalog' | 'account' | 'cart' | 'checkout' | 'auth';
  weight: number;
  expected: number[];
  run: () => Promise<Result>;
};

const ADJECTIVES = ['Cotton', 'Steel', 'Leather', 'Bamboo', 'Wireless'];
const NOUNS = ['Shirt', 'Kettle', 'Backpack', 'Lamp', 'Speaker'];

function operations(users: VirtualUser[], offers: string[]): Op[] {
  const anonymous = (): string => clientIp(1_000 + between(0, 999));
  const user = (): VirtualUser => pick(users);
  return [
    {
      name: 'catalog.list',
      group: 'catalog',
      weight: 25,
      expected: [200],
      run: () =>
        call('GET', `/catalog/products?page=${between(1, 50)}&limit=20`, {
          ip: anonymous(),
        }),
    },
    {
      name: 'catalog.search',
      group: 'catalog',
      weight: 10,
      expected: [200],
      run: () =>
        call(
          'GET',
          `/catalog/products?q=${encodeURIComponent(`${pick(ADJECTIVES)} ${pick(NOUNS)}`)}&limit=20`,
          { ip: anonymous() },
        ),
    },
    {
      name: 'catalog.category',
      group: 'catalog',
      weight: 10,
      expected: [200],
      run: () =>
        call(
          'GET',
          `/catalog/products?categorySlug=load-category-${between(1, 40)}&page=${between(1, 5)}&limit=20`,
          { ip: anonymous() },
        ),
    },
    {
      name: 'catalog.detail',
      group: 'catalog',
      weight: 15,
      expected: [200],
      run: () =>
        call('GET', `/catalog/products/load-product-${skewed(products)}`, {
          ip: anonymous(),
        }),
    },
    {
      name: 'account.orders',
      group: 'account',
      weight: 10,
      expected: [200],
      run: (): Promise<Result> => {
        const u = user();
        return call('GET', '/orders', { ip: u.ip, token: u.token });
      },
    },
    {
      name: 'account.me',
      group: 'account',
      weight: 5,
      expected: [200],
      run: (): Promise<Result> => {
        const u = user();
        return call('GET', '/users/me', { ip: u.ip, token: u.token });
      },
    },
    {
      name: 'account.order',
      group: 'account',
      weight: 5,
      expected: [200],
      run: (): Promise<Result> => {
        const u = user();
        return u.orderIds.length
          ? call('GET', `/orders/${pick(u.orderIds)}`, {
              ip: u.ip,
              token: u.token,
            })
          : call('GET', '/orders', { ip: u.ip, token: u.token });
      },
    },
    {
      name: 'cart.add',
      group: 'cart',
      weight: 7,
      expected: [201],
      run: async (): Promise<Result> => {
        const u = user();
        const result = await call('POST', '/cart/items', {
          ip: u.ip,
          token: u.token,
          body: { offerId: pick(offers), quantity: 1 },
          parse: true,
        });
        const items = (result.body as { items?: { id: string }[] })?.items;
        if (items) u.cartItemIds = items.map((item) => item.id);
        return result;
      },
    },
    {
      name: 'cart.remove',
      group: 'cart',
      weight: 3,
      // 201 when the user had no line to remove and an add ran instead.
      expected: [200, 201, 204],
      run: async (): Promise<Result> => {
        const u = user();
        const itemId = u.cartItemIds.pop();
        if (!itemId)
          return call('POST', '/cart/items', {
            ip: u.ip,
            token: u.token,
            body: { offerId: pick(offers), quantity: 1 },
          });
        return call('DELETE', `/cart/items/${itemId}`, {
          ip: u.ip,
          token: u.token,
        });
      },
    },
    {
      name: 'checkout.buy_now',
      group: 'checkout',
      weight: 5,
      // 503: the pending provider's deterministic rejection (see header).
      // 409: the chosen offer had too little stock left.
      expected: [503, 409],
      run: (): Promise<Result> => {
        const u = user();
        return call('POST', '/checkout/buy-now', {
          ip: u.ip,
          token: u.token,
          headers: { 'idempotency-key': randomUUID() },
          body: {
            offerId: pick(offers),
            quantity: 1,
            shippingAddressId: u.addressId,
          },
        });
      },
    },
    {
      name: 'auth.login',
      group: 'auth',
      weight: 5,
      expected: [200],
      run: () =>
        call('POST', '/auth/login', {
          ip: clientIp(2_000 + between(0, 4_999)),
          body: {
            email: loadUserEmail(between(1, config.datasetUsers)),
            password: LOAD_PASSWORD,
          },
        }),
    },
  ].filter((op) => !config.only || config.only.includes(op.group)) as Op[];
}

// Setup is not measured, so it waits longer and retries: cost-12 bcrypt on
// the event loop makes concurrent logins slow on a freshly started API.
async function login(email: string, ip: string): Promise<string> {
  let status = 0;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await call('POST', '/auth/login', {
      ip,
      body: { email, password: LOAD_PASSWORD },
      parse: true,
      timeoutMs: 30_000,
    });
    const token = (result.body as { accessToken?: string } | undefined)
      ?.accessToken;
    if (result.status === 200 && token) return token;
    status = result.status;
  }
  throw new Error(`Login failed for ${email}: HTTP ${status}`);
}

async function inBatches<T, R>(
  items: T[],
  size: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size)
    results.push(...(await Promise.all(items.slice(i, i + size).map(run))));
  return results;
}

async function setup(): Promise<{
  users: VirtualUser[];
  offers: string[];
  adminToken: string;
}> {
  const adminToken = await login(LOAD_ADMIN_EMAIL, clientIp(9_000));
  const numbers = Array.from(
    { length: config.poolUsers },
    (_, i) => 1 + ((i * 7919) % config.datasetUsers),
  );
  const users = await inBatches(numbers, 4, async (n) => {
    const ip = clientIp(n % 1_000);
    const token = await login(loadUserEmail(n), ip);
    const addresses = await call('GET', '/users/me/addresses', {
      ip,
      token,
      parse: true,
    });
    const address = (addresses.body as { id: string; isDefault: boolean }[])
      .slice()
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))[0];
    if (!address) throw new Error(`User ${n} has no address`);
    const orders = await call('GET', '/orders', { ip, token, parse: true });
    const orderIds = ((orders.body as { id: string }[] | undefined) ?? [])
      .slice(0, 5)
      .map((order) => order.id);
    return {
      n,
      ip,
      token,
      addressId: address.id,
      orderIds,
      cartItemIds: [],
    };
  });

  // Hot products plus a uniform sample, keeping offers that report stock.
  const slugs = [
    ...Array.from({ length: 200 }, (_, i) => i + 1),
    ...Array.from({ length: 300 }, () => between(1, products)),
  ];
  const offerLists = await inBatches(slugs, 20, async (n) => {
    const detail = await call('GET', `/catalog/products/load-product-${n}`, {
      ip: clientIp(8_000 + (n % 250)),
      parse: true,
    });
    const variants =
      (
        detail.body as
          | { variants?: { offers?: { id: string; inStock: boolean }[] }[] }
          | undefined
      )?.variants ?? [];
    return variants.flatMap((variant) =>
      (variant.offers ?? [])
        .filter((offer) => offer.inStock)
        .map((offer) => offer.id),
    );
  });
  const offers = [...new Set(offerLists.flat())];
  if (offers.length === 0) throw new Error('No in-stock offers found');
  return { users, offers, adminToken };
}

type Sample = {
  t: number;
  rssBytes: number;
  heapUsedBytes: number;
  cpuSeconds: number;
  eventLoopP99Ms: number | null;
  eventLoopMaxMs: number | null;
  activeRequests: number;
  jobsOldestDueAgeS: number;
  outboxOldestDueAgeS: number;
  jobsPending: number;
  outboxPending: number;
  poolBusy: number | null;
  poolWaiting: number | null;
  dbConnections: number;
  dbLockWaiting: number;
};

type ServerSnapshot = {
  process: {
    rssBytes: number;
    heapUsedBytes: number;
    cpuUserSeconds: number;
    cpuSystemSeconds: number;
    activeRequests: number;
    eventLoopDelay: { p99Ms: number | null; maxMs: number | null };
  };
  requests: {
    method: string;
    route: string;
    count: number;
    errorCount: number;
    latency: {
      p50Ms: number | null;
      p95Ms: number | null;
      p99Ms: number | null;
    };
  }[];
  jobs: {
    type: string;
    succeeded: number;
    failed: number;
    deadLettered: number;
    startLag: {
      p50Ms: number | null;
      p95Ms: number | null;
      p99Ms: number | null;
    };
  }[];
  outbox: {
    topic: string;
    published: number;
    failed: number;
    deadLettered: number;
    dispatchLag: {
      p50Ms: number | null;
      p95Ms: number | null;
      p99Ms: number | null;
    };
  }[];
  operational: {
    error: string | null;
    jobs: {
      status: string;
      count: number;
      oldestDueAgeSeconds: number | null;
    }[];
    outbox: {
      status: string;
      count: number;
      oldestDueAgeSeconds: number | null;
    }[];
    database: {
      connectionsByState: Record<string, number>;
      lockWaitingSessions: number;
    } | null;
    pool: { busy: number | null; waiting: number | null } | null;
  };
};

async function snapshot(adminToken: string): Promise<ServerSnapshot | null> {
  const result = await call('GET', '/metrics', {
    ip: clientIp(9_001),
    token: adminToken,
    parse: true,
  });
  return result.status === 200 ? (result.body as ServerSnapshot) : null;
}

function toSample(t: number, s: ServerSnapshot): Sample {
  const pending = (rows: { status: string; count: number }[]): number =>
    rows
      .filter((r) => r.status === 'PENDING')
      .reduce((sum, r) => sum + r.count, 0);
  const oldest = (
    rows: { status: string; oldestDueAgeSeconds: number | null }[],
  ): number => Math.max(0, ...rows.map((r) => r.oldestDueAgeSeconds ?? 0));
  const op = s.operational;
  return {
    t,
    rssBytes: s.process.rssBytes,
    heapUsedBytes: s.process.heapUsedBytes,
    cpuSeconds: s.process.cpuUserSeconds + s.process.cpuSystemSeconds,
    eventLoopP99Ms: s.process.eventLoopDelay.p99Ms,
    eventLoopMaxMs: s.process.eventLoopDelay.maxMs,
    activeRequests: s.process.activeRequests,
    jobsOldestDueAgeS: oldest(op.jobs),
    outboxOldestDueAgeS: oldest(op.outbox),
    jobsPending: pending(op.jobs),
    outboxPending: pending(op.outbox),
    poolBusy: op.pool?.busy ?? null,
    poolWaiting: op.pool?.waiting ?? null,
    dbConnections: Object.values(op.database?.connectionsByState ?? {}).reduce(
      (sum, n) => sum + n,
      0,
    ),
    dbLockWaiting: op.database?.lockWaitingSessions ?? 0,
  };
}

function percentile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return Math.round((sorted[Math.max(0, index)] ?? 0) * 10) / 10;
}

function summarize(
  records: { op: Op; status: number; ms: number; error?: string }[],
  seconds: number,
): Record<string, unknown> {
  const latencies = records.map((r) => r.ms).sort((a, b) => a - b);
  const statuses: Record<string, number> = {};
  let unexpected = 0;
  let throttled = 0;
  const clientErrors: Record<string, number> = {};
  for (const r of records) {
    statuses[String(r.status)] = (statuses[String(r.status)] ?? 0) + 1;
    if (r.error) clientErrors[r.error] = (clientErrors[r.error] ?? 0) + 1;
    if (r.status === 429) throttled += 1;
    else if (!r.op.expected.includes(r.status)) unexpected += 1;
  }
  return {
    requests: records.length,
    throughputRps: Math.round((records.length / seconds) * 10) / 10,
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    p99Ms: percentile(latencies, 0.99),
    maxMs: percentile(latencies, 1),
    unexpected,
    unexpectedRate:
      records.length === 0
        ? 0
        : Math.round((unexpected / records.length) * 1e5) / 1e5,
    throttled,
    statuses,
    clientErrors,
  };
}

function revision(): string {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'])
      .toString()
      .trim();
    const dirty = execFileSync('git', ['status', '--porcelain'])
      .toString()
      .trim();
    return dirty ? `${sha}+uncommitted` : sha;
  } catch {
    return 'unknown';
  }
}

async function main(): Promise<void> {
  console.log(`Setting up ${config.poolUsers} signed-in users...`);
  const { users, offers, adminToken } = await setup();
  const ops = operations(users, offers);
  const totalWeight = ops.reduce((sum, op) => sum + op.weight, 0);
  const choose = (): Op => {
    let roll = random() * totalWeight;
    for (const op of ops) {
      roll -= op.weight;
      if (roll < 0) return op;
    }
    return ops[ops.length - 1] as Op;
  };
  console.log(
    `Ready: ${users.length} users, ${offers.length} in-stock offers. ` +
      `Running ${config.rps} req/s for ${config.durationS}s (${config.warmupS}s warm-up).`,
  );

  const records: {
    op: Op;
    status: number;
    ms: number;
    error?: string;
    at: number;
  }[] = [];
  const samples: Sample[] = [];
  let inFlight = 0;
  let dropped = 0;
  let dispatched = 0;
  const startedAt = performance.now();
  const endAt = startedAt + config.durationS * 1_000;
  const warmupEnd = startedAt + config.warmupS * 1_000;
  const pending = new Set<Promise<void>>();

  const sampler = (async (): Promise<void> => {
    while (performance.now() < endAt) {
      const s = await snapshot(adminToken);
      if (s) samples.push(toSample((performance.now() - startedAt) / 1_000, s));
      await sleep(config.sampleEveryS * 1_000);
    }
  })();

  while (performance.now() < endAt) {
    const due = Math.floor(
      ((performance.now() - startedAt) / 1_000) * config.rps,
    );
    while (dispatched < due) {
      dispatched += 1;
      if (inFlight >= config.maxInFlight) {
        dropped += 1;
        continue;
      }
      const op = choose();
      const at = performance.now();
      inFlight += 1;
      const task = op
        .run()
        .then((result) => {
          if (at >= warmupEnd)
            records.push({
              op,
              status: result.status,
              ms: result.ms,
              error: result.error,
              at,
            });
        })
        .finally(() => {
          inFlight -= 1;
          pending.delete(task);
        });
      pending.add(task);
    }
    await sleep(5);
  }
  await Promise.all(pending);
  await sampler;
  const final = await snapshot(adminToken);

  const measuredSeconds = config.durationS - config.warmupS;
  const byOp = Object.fromEntries(
    ops.map((op) => [
      op.name,
      summarize(
        records.filter((r) => r.op === op),
        measuredSeconds,
      ),
    ]),
  );
  const byGroup = Object.fromEntries(
    [...new Set(ops.map((op) => op.group))].map((group) => [
      group,
      summarize(
        records.filter((r) => r.op.group === group),
        measuredSeconds,
      ),
    ]),
  );
  const measured = samples.filter((s) => s.t >= config.warmupS);
  const first = measured[0];
  const last = measured[measured.length - 1];
  const max = (pick: (s: Sample) => number | null): number | null => {
    const values = measured.map(pick).filter((v): v is number => v !== null);
    return values.length ? Math.max(...values) : null;
  };
  const mean = (pick: (s: Sample) => number): number | null =>
    measured.length
      ? Math.round(
          (measured.reduce((sum, s) => sum + pick(s), 0) / measured.length) *
            10,
        ) / 10
      : null;

  const result = {
    recordedAt: new Date().toISOString(),
    revision: revision(),
    config: { ...config, output: undefined, seedReport: undefined },
    client: {
      node: process.version,
      platform: `${os.platform()} ${os.release()}`,
      cpus: `${os.cpus().length} x ${os.cpus()[0]?.model ?? 'unknown'}`,
      totalMemoryBytes: os.totalmem(),
    },
    dataset:
      config.seedReport && existsSync(config.seedReport)
        ? (JSON.parse(readFileSync(config.seedReport, 'utf8')) as unknown)
        : null,
    offered: {
      dispatched,
      droppedAtClientCap: dropped,
      measuredSeconds,
    },
    overall: summarize(records, measuredSeconds),
    byGroup,
    byOperation: byOp,
    resources: {
      samples: measured.length,
      rssBytes: {
        start: first?.rssBytes ?? null,
        peak: max((s) => s.rssBytes),
        end: last?.rssBytes ?? null,
      },
      heapUsedBytesPeak: max((s) => s.heapUsedBytes),
      apiCpuPercentOfOneCore:
        first && last && last.t > first.t
          ? Math.round(
              ((last.cpuSeconds - first.cpuSeconds) / (last.t - first.t)) *
                1000,
            ) / 10
          : null,
      eventLoopDelayP99MsMax: max((s) => s.eventLoopP99Ms),
      eventLoopDelayMaxMs: max((s) => s.eventLoopMaxMs),
      activeRequestsMax: max((s) => s.activeRequests),
      activeRequestsMean: mean((s) => s.activeRequests),
      prismaPoolBusyMax: max((s) => s.poolBusy),
      prismaQueriesWaitingMax: max((s) => s.poolWaiting),
      dbConnectionsMax: max((s) => s.dbConnections),
      dbLockWaitingMax: max((s) => s.dbLockWaiting),
    },
    queues: {
      jobsPendingMax: max((s) => s.jobsPending),
      jobsOldestDueAgeSecondsMax: max((s) => s.jobsOldestDueAgeS),
      outboxPendingMax: max((s) => s.outboxPending),
      outboxOldestDueAgeSecondsMax: max((s) => s.outboxOldestDueAgeS),
      jobStartLag: final?.jobs ?? null,
      outboxDispatch: final?.outbox ?? null,
    },
    serverRoutes: final?.requests
      .filter((r) => r.count >= 10)
      .sort((a, b) => b.count - a.count),
    samples: measured,
  };

  mkdirSync(dirname(config.output), { recursive: true });
  writeFileSync(config.output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        overall: result.overall,
        byGroup,
        resources: result.resources,
        queues: {
          ...result.queues,
          jobStartLag: undefined,
          outboxDispatch: undefined,
        },
      },
      null,
      2,
    ),
  );
  console.log(`Full result: ${config.output}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
