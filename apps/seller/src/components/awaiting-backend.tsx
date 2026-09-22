import type { ReactNode } from 'react';

import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * A section whose endpoints the Commerce API does not expose yet.
 *
 * It names what is missing rather than showing an empty table, because an
 * empty table reads as "no data" when the truth is "no endpoint" — and the two
 * call for completely different actions.
 */
export function AwaitingBackend({
  title,
  description,
  needs,
  note,
}: {
  title: string;
  description: string;
  /** The endpoints or capabilities this section is waiting on. */
  needs: string[];
  note?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Not available in the Commerce API yet</CardTitle>
          <CardDescription>
            This screen is built and wired; it is waiting on the API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">It needs:</p>
          <ul className="space-y-1">
            {needs.map((need) => (
              <li key={need} className="font-mono text-xs">
                {need}
              </li>
            ))}
          </ul>
          {note ? (
            <p className="text-muted-foreground text-pretty">{note}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
