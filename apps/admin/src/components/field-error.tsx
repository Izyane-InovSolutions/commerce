export function FieldError({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) {
    return null;
  }

  return (
    <p className="text-destructive text-sm" role="alert">
      {messages.join(' ')}
    </p>
  );
}
