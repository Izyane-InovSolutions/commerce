import { apiFetch } from './client';

export type HealthResponse = {
  status: 'ok';
};

/**
 * Reads the Commerce API health endpoint.
 *
 * The result is never cached so a status readout always reflects the API as it
 * is right now.
 */
export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/health', { cache: 'no-store', signal });
}
