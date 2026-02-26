import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseInstallOptions } from './install';

describe('parseInstallOptions', () => {
  it('defaults to skills install in local scope', () => {
    const options = parseInstallOptions({});

    expect(options).toEqual({
      skills: true,
      global: false,
      target: undefined,
      force: false
    });
  });

  it('supports global + force + target overrides', () => {
    const options = parseInstallOptions({
      skills: true,
      global: true,
      force: true,
      target: './custom-skills'
    });

    expect(options.skills).toBe(true);
    expect(options.global).toBe(true);
    expect(options.force).toBe(true);
    expect(options.target).toBe(path.resolve('./custom-skills'));
  });

  it('can disable skills flag explicitly', () => {
    const options = parseInstallOptions({
      skills: false
    });

    expect(options.skills).toBe(false);
  });
});
