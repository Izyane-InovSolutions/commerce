import type { ReactNode } from 'react';

type PlaceholderPageProps = {
  title: string;
  description: string;
  children?: ReactNode;
};

/**
 * Shell for routes that exist so the storefront navigation is complete, but
 * whose behaviour arrives with the corresponding phase of work.
 */
export function PlaceholderPage({
  title,
  description,
  children,
}: PlaceholderPageProps) {
  return (
    <div className="mx-auto max-w-6xl space-y-3 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground max-w-2xl text-pretty">
        {description}
      </p>
      {children}
    </div>
  );
}
