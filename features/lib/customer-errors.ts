/** graphql-request's Error.message includes request metadata; show the API's copy only. */
export function customerErrorMessage(error: unknown, fallback: string): string {
  const errors = (error as any)?.response?.errors;
  const message = Array.isArray(errors) ? errors.find((entry: any) => typeof entry?.message === 'string' && entry.message.trim())?.message : undefined;
  return message || fallback;
}
