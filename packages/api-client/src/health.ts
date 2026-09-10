import type { ApiClient } from './client';

export type HealthResponse = {
  status: 'ok';
};

/**
 * Reads the Commerce API health endpoint.
 *
 * The result is never cached so a status readout always reflects the API as it
 * is right now.
 */
export function getHealth(
  client: ApiClient,
  signal?: AbortSignal,
): Promise<HealthResponse> {
  return client.get<HealthResponse>('/health', { cache: 'no-store', signal });
}
