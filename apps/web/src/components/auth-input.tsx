'use client';

import { useState, type ComponentProps } from 'react';
import type { LucideIcon } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * A pill-shaped input with a leading icon, used by the sign-in/sign-up
 * forms — `toggleable` adds a Show/Hide control instead of exposing the
 * password in plain text by default.
 */
export function AuthInput({
  icon: Icon,
  toggleable,
  className,
  type = 'text',
  ...props
}: ComponentProps<typeof Input> & {
  icon: LucideIcon;
  toggleable?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-slate-400" />
      <Input
        type={toggleable ? (visible ? 'text' : 'password') : type}
        className={cn(
          'h-11 rounded-full border-none bg-white pl-11 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-400',
          toggleable && 'pr-16',
          className,
        )}
        {...props}
      />
      {toggleable ? (
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute top-1/2 right-4 -translate-y-1/2 text-xs font-semibold tracking-wide text-blue-600 uppercase"
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      ) : null}
    </div>
  );
}
