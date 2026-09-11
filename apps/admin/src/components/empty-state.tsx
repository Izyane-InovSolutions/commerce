import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm text-pretty">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
