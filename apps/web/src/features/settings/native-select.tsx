import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  children: ReactNode;
}

/** Labelled native `<select>` styled like `Input`; native so options can be individually disabled. */
export function SelectField({ label, className, children, ...props }: SelectFieldProps) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={cn(
          'h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}
