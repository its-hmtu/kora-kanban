import { useId } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AuthFieldProps {
  label: string;
  type?: 'text' | 'email' | 'password';
  autoComplete?: string;
  registration: UseFormRegisterReturn;
  error?: string;
}

/** Label + input + inline error, wired to react-hook-form's `register`. */
export function AuthField({
  label,
  type = 'text',
  autoComplete,
  registration,
  error,
}: AuthFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...registration}
      />
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
