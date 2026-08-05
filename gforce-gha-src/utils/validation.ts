/**
 * Generic input parsers shared by the per-action Validators. These operate on
 * raw strings (the shape GitHub Action inputs arrive in) and throw
 * {@link ValidationError} on bad data.
 */
import { ValidationError } from './errors';

const TRUE_VALUES = new Set(['true', '1', 'yes', 'y', 'on']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'n', 'off']);

/**
 * Read one named input from the raw payload an entry point hands the
 * Orchestrator. Throws when the payload is not an object or the value is not a
 * string; returns `undefined` when the input is simply absent.
 */
export function readStringInput(rawInputs: unknown, name: string): string | undefined {
  if (typeof rawInputs !== 'object' || rawInputs === null) {
    throw new ValidationError('Expected raw inputs to be an object');
  }
  const entry = Object.entries(rawInputs).find(([key]) => key === name);
  const value: unknown = entry === undefined ? undefined : entry[1];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ValidationError(`Input "${name}" must be a string`);
  }
  return value;
}

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
