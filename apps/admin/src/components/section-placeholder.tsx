import type { ReactNode } from 'react';

type SectionPlaceholderProps = {
  title: string;
  description: string;
  children?: ReactNode;
};

/**
 * Shell for sections that exist so the portal navigation is complete, but
 * whose behaviour arrives with the corresponding phase of work.
 */
export function SectionPlaceholder({
  title,
  description,
  children,
}: SectionPlaceholderProps) {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground max-w-2xl text-pretty">
        {description}
      </p>
      {children}
    </div>
  );
}
