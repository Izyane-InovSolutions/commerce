import type { ReactNode } from 'react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export type TableView = {
  columns: string[];
  rows: (string | number)[][];
};

/**
 * The frame every chart sits in.
 *
 * Carries the table-view twin, which is not optional: a tooltip may enhance a
 * chart but must never be the only way to read a value, and two of the status
 * fills sit below 3:1 on a white surface by design. `<details>` gives that for
 * free — keyboard reachable, no JavaScript.
 */
export function ChartFrame({
  title,
  description,
  table,
  children,
  footer,
}: {
  title: string;
  description: string;
  table: TableView;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        {footer}

        <details className="text-sm">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
            Table view
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left">
                  {table.columns.map((column, index) => (
                    <th
                      key={column}
                      scope="col"
                      className={
                        index === 0
                          ? 'py-1 pr-3 font-normal'
                          : 'py-1 pr-3 text-right font-normal'
                      }
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={String(row[0])} className="border-t">
                    {row.map((cell, index) => (
                      <td
                        key={index}
                        className={
                          index === 0
                            ? 'py-1 pr-3'
                            : 'py-1 pr-3 text-right tabular-nums'
                        }
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

/**
 * Identity for a chart carrying two or more series.
 *
 * A swatch beside text, never coloured text: a light fill is illegible as
 * type on the surface. Status entries take an icon too, so meaning never
 * rests on hue alone.
 */
export function Legend({
  items,
}: {
  items: { label: string; color: string; icon?: ReactNode }[];
}) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-sm"
            style={{ background: item.color }}
          />
          {item.icon}
          <span className="text-muted-foreground">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** Shown in place of a chart when there is genuinely nothing to plot. */
export function NoData({ message }: { message: string }) {
  return (
    <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">
      {message}
    </p>
  );
}
