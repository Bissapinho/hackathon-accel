import type { ApiError as ApiErrorBody, FieldError } from '@mini/shared';
import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

// Thrown by services and routes; mapped to the ApiError body by the error handler below (04-api intro).
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: { hint?: string; details?: FieldError[] } = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toBody(): ApiErrorBody {
    return { code: this.code, message: this.message, ...this.extra };
  }
}

export const notFound = (what: string, why: string, hint?: string) =>
  new ApiError(404, 'NOT_FOUND', `${what} was not found: ${why}.`, hint ? { hint } : {});

export function zodDetails(err: ZodError): FieldError[] {
  return err.issues.map((i) => ({
    path: i.path.map((p, n) => (typeof p === 'number' ? `[${p}]` : n === 0 ? p : `.${p}`)).join(''),
    code: i.code,
    message: i.message,
  }));
}

export function installErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    if (err instanceof ApiError) return reply.status(err.status).send(err.toBody());
    if (err instanceof ZodError) {
      const body: ApiErrorBody = {
        code: 'VALIDATION_FAILED',
        message: 'Some fields are missing or invalid.',
        details: zodDetails(err),
      };
      return reply.status(400).send(body);
    }
    const fe = err as FastifyError;
    if (fe.statusCode && fe.statusCode >= 400 && fe.statusCode < 500) {
      const body: ApiErrorBody = { code: fe.code ?? 'BAD_REQUEST', message: fe.message };
      return reply.status(fe.statusCode).send(body);
    }
    req.log.error({ err }, 'unexpected error');
    const body: ApiErrorBody = {
      code: 'INTERNAL',
      message: 'Something went wrong on the server.',
      hint: 'Try again; if it keeps failing, check the server logs.',
    };
    return reply.status(500).send(body);
  });

  app.setNotFoundHandler((req, reply) => {
    const body: ApiErrorBody = {
      code: 'NOT_FOUND',
      message: `There is no route ${req.method} ${req.url.split('?')[0]}.`,
      hint: 'Check the path against 04-api.md.',
    };
    return reply.status(404).send(body);
  });
}
