/** Ring 2 — port-adjacent error type. Tools branch on `.kind`, never on message text. */
export type ApiErrorKind =
  | 'unreachable'
  | 'not_found'
  | 'validation'
  | 'rate_limited'
  | 'server'
  | 'bad_response';

export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
