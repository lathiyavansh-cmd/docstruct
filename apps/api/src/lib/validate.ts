import { z, type ZodTypeAny } from 'zod';
import { badRequest } from './errors.js';

/** SE-14: validate user-supplied input on the server; reject anything malformed with a 400. */
export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const first = issues[0];
    throw badRequest(first ? `${first.path || 'input'}: ${first.message}` : 'Invalid input', issues);
  }
  return result.data;
}

export const uuid = z.string().uuid();
export const idParam = (name: string) => z.object({ [name]: uuid });
