/**
 * What this file does
 *   Checks incoming request data against a Zod schema and rejects bad input with a 400 error.
 *
 * How it works
 *   - parse() runs the schema; on failure it lists each problem and throws badRequest.
 *   - uuid and idParam() are reusable schemas for id values in URLs.
 *
 * Where it fits
 *   Used by the route files of every module and by storage/routes.ts. Module: server core (owner: Vansh).
 */
import { z, type ZodTypeAny } from 'zod';
import { badRequest } from './errors.js';

/** SE-14: validate user-supplied input on the server; reject anything malformed with a 400. */
export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    // The message names the first bad field; the full list goes in details for the client.
    const first = issues[0];
    throw badRequest(first ? `${first.path || 'input'}: ${first.message}` : 'Invalid input', issues);
  }
  return result.data;
}

export const uuid = z.string().uuid();
export const idParam = (name: string) => z.object({ [name]: uuid });
