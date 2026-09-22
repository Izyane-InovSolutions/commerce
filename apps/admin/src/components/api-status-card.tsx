import { getHealth } from '@commerce/api-client';

import { apiClient } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type ApiStatus =
  | { reachable: true; mock: boolean }
  | { reachable: false; detail: string };

async function readApiStatus(): Promise<ApiStatus> {
  try {
    const health = await getHealth(apiClient);
    return { reachable: true, mock: health.mock === true };
  } catch (error) {
    return {
      reachable: false,
      detail: error instanceof Error ? error.message : 'Unknown error.',
    };
  }
}

/**
 * Live connectivity to the Commerce API.
 *
 * The stand-in mock and the real API serve the same routes, so which one
 * answered is read from the health response rather than guessed from the URL.
 */
export async function ApiStatusCard() {
  const status = await readApiStatus();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Commerce API
          <Badge variant={status.reachable ? 'default' : 'destructive'}>
            {status.reachable ? 'Reachable' : 'Unreachable'}
          </Badge>
          {status.reachable && status.mock ? (
            <Badge variant="secondary">Mock data</Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          <code className="font-mono">{apiClient.baseUrl}</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-1 text-sm">
        {status.reachable ? (
          status.mock ? (
            <p>
              Answered by the stand-in mock, not the NestJS API. Point{' '}
              <code className="font-mono">NEXT_PUBLIC_API_BASE_URL</code> at the
              real API to switch over.
            </p>
          ) : (
            <p>Answered by the NestJS Commerce API.</p>
          )
        ) : (
          <p>
            {status.detail} Start it with{' '}
            <code className="font-mono">npm run api:dev</code>.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
