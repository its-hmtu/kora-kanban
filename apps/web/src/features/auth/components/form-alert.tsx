export function FormAlert({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/50 p-3 text-sm text-destructive"
    >
      {message}
    </p>
  );
}
