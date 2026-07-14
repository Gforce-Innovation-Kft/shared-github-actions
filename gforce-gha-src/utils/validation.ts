/**
 * Generic input parsers shared by the per-action Validators. These operate on
 * raw strings (the shape GitHub Action inputs arrive in) and throw
 * {@link ValidationError} on bad data.
 */
import { ValidationError } from './errors';

const TRUE_VALUES = new Set(['true', '1', 'yes', 'y', 'on']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'n', 'off']);

/** Trim a value and require it to be non-empty. */
export function requireNonEmpty(name: string, value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`Input "${name}" is required`);
  }
  return trimmed;
}

/** Parse a permissive boolean string, falling back to `defaultValue` when blank. */
export function parseBoolean(value: string | undefined, defaultValue = false): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized.length === 0) {
    return defaultValue;
  }
  if (TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_VALUES.has(normalized)) {
    return false;
  }
  throw new ValidationError(`Expected a boolean but received "${value}"`);
}

/** Split a comma- or newline-separated string into a trimmed, de-blanked list. */
export function parseList(value: string | undefined): readonly string[] {
  return (value ?? '')
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Ensure `value` is one of `allowed`, returning `defaultValue` when blank. */
export function parseEnum<T extends string>(
  name: string,
  value: string | undefined,
  allowed: readonly T[],
  defaultValue: T,
): T {
  const normalized = (value ?? '').trim();
  if (normalized.length === 0) {
    return defaultValue;
  }
  const match = allowed.find((candidate) => candidate === normalized);
  if (match !== undefined) {
    return match;
  }
  throw new ValidationError(
    `Input "${name}" must be one of: ${allowed.join(', ')} (received "${value}")`,
  );
}
