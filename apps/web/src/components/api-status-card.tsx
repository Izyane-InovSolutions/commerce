import { getHealth } from '@/lib/api/health';
import { env } from '@/lib/env';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type ApiStatus = { reachable: true } | { reachable: false; detail: string };

async function readApiStatus(): Promise<ApiStatus> {
  try {
    await getHealth();
    return { reachable: true };
  } catch (error) {
    return {
      reachable: false,
      detail: error instanceof Error ? error.message : 'Unknown error.',
    };
  }
}

/**
 * Renders live connectivity to the Commerce API so a misconfigured
 * `NEXT_PUBLIC_API_BASE_URL` is obvious during local development.
 */
export async function ApiStatusCard() {
  const status = await readApiStatus();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Commerce API
          <Badge variant={status.reachable ? 'default' : 'destructive'}>
            {status.reachable ? 'Reachable' : 'Unreachable'}
          </Badge>
        </CardTitle>
        <CardDescription>
          <code className="font-mono">{env.apiBaseUrl}</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        {status.reachable
          ? 'The storefront can reach GET /health.'
          : status.detail}
      </CardContent>
    </Card>
  );
}
