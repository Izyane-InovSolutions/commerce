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
 * Renders live connectivity to the Commerce API.
 *
 * The mock and the real API share an address, so which one answered is read
 * from the health response rather than guessed from the URL. That keeps
 * fixture data from being mistaken for the real thing.
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
              Answered by the stand-in mock API, serving fixtures from{' '}
              <code className="font-mono">@commerce/contracts</code>. Every
              client shares this one dataset. Stop it and start the real API to
              integrate — no configuration changes.
            </p>
          ) : (
            <p>Answered by the Commerce API.</p>
          )
        ) : (
          <p>
            {status.detail} Start one with{' '}
            <code className="font-mono">npm run mock:dev</code>.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
