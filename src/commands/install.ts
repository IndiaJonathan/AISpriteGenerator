import { access, cp, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { CliUsageError } from '../utils/errors';
import { optionalStringOption, parseCommandArgs, type ParsedValues } from '../utils/parse';

type InstallOptions = {
  skills: boolean;
  global: boolean;
  target?: string;
  force: boolean;
};

const SKILL_NAME = 'aispritegenerator-generate-images';

export async function runInstallCommand(argv: string[]): Promise<void> {
  const { values, positionals } = parseCommandArgs(argv, {
    skills: { type: 'boolean' },
    global: { type: 'boolean' },
    target: { type: 'string' },
    force: { type: 'boolean' }
  });

  if (positionals.length > 0) {
    throw new CliUsageError(`Unexpected positional arguments: ${positionals.join(', ')}`);
  }

  const options = parseInstallOptions(values);

  if (!options.skills) {
    throw new CliUsageError('No install target selected. Use --skills (or run `install` with no flags).');
  }

  const source = path.resolve(__dirname, '..', '..', 'skills', SKILL_NAME);
  try {
    await access(source);
  } catch {
    throw new CliUsageError(`Bundled skill directory not found: "${source}".`);
  }

  const destinationRoot = resolveSkillRoot(options);
  const destination = path.join(destinationRoot, SKILL_NAME);

  await mkdir(destinationRoot, { recursive: true });
  try {
    await cp(source, destination, {
      recursive: true,
      force: options.force,
      errorOnExist: !options.force
    });
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String((error as { code?: unknown }).code) : '';
    if (code === 'ERR_FS_CP_EEXIST' || code === 'EEXIST') {
      throw new CliUsageError(`Skill already exists at "${destination}". Re-run with --force to overwrite.`);
    }

    throw error;
  }

  const payload = {
    ok: true,
    installed: {
      skill: SKILL_NAME,
      source,
      destination,
      scope: options.target ? 'custom' : options.global ? 'global' : 'local',
      force: options.force
    }
  };

  console.log(JSON.stringify(payload, null, 2));
}

export function parseInstallOptions(values: ParsedValues): InstallOptions {
  const targetRaw = optionalStringOption(values, 'target');
  const target = targetRaw ? path.resolve(targetRaw) : undefined;

  return {
    skills: values['skills'] !== false,
    global: values['global'] === true,
    target,
    force: values['force'] === true
  };
}

function resolveSkillRoot(options: InstallOptions): string {
  if (options.target) {
    return path.resolve(options.target);
  }

  if (options.global) {
    const codexHome = process.env.CODEX_HOME?.trim() || path.join(homedir(), '.codex');
    return path.join(codexHome, 'skills');
  }

  return path.resolve(process.cwd(), '.codex', 'skills');
}
