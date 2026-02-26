import { parseArgs } from 'node:util';
import { CliUsageError } from './errors';

export type ParsedValues = Record<string, string | boolean | undefined>;

export function parseCommandArgs(
  argv: string[],
  options: NonNullable<Parameters<typeof parseArgs>[0]>['options'],
  allowPositionals = false
): { values: ParsedValues; positionals: string[] } {
  try {
    const parsed = parseArgs({
      args: argv,
      options,
      allowPositionals,
      strict: true
    });

    return {
      values: parsed.values as ParsedValues,
      positionals: parsed.positionals
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliUsageError(message);
  }
}

export function requireStringOption(values: ParsedValues, key: string, flag: string): string {
  const value = values[key];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CliUsageError(`${flag} is required.`);
  }

  return value.trim();
}

export function optionalStringOption(values: ParsedValues, key: string): string | undefined {
  const value = values[key];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parsePositiveInteger(raw: string, flag: string): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliUsageError(`${flag} must be a positive integer.`);
  }

  return parsed;
}

export function parseNonNegativeInteger(raw: string, flag: string): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CliUsageError(`${flag} must be a non-negative integer.`);
  }

  return parsed;
}

export function parseCsv(raw: string | undefined): string[] | undefined {
  if (!raw) {
    return undefined;
  }

  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return entries.length > 0 ? entries : undefined;
}
