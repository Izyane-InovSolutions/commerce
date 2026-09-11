import { createSeedDb, type MockDb } from './seed.ts';

const STORE_KEY = Symbol.for('@commerce/mock-api/store');

type StoreHolder = { [STORE_KEY]?: MockDb };

/**
 * The mock database.
 *
 * It is held on `globalThis` so writes survive the module reloads Next.js
 * performs in development. State is per process, so each app keeps its own
 * copy — both start from identical seed data.
 */
export function db(): MockDb {
  const holder = globalThis as StoreHolder;
  holder[STORE_KEY] ??= createSeedDb();
  return holder[STORE_KEY];
}

/** Discards all writes and returns the database to its seed state. */
export function resetDb(): MockDb {
  const holder = globalThis as StoreHolder;
  holder[STORE_KEY] = createSeedDb();
  return holder[STORE_KEY];
}
