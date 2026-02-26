import { parseCommandArgs, optionalStringOption, requireStringOption } from '../utils/parse';
import { CliUsageError } from '../utils/errors';
import type { CliServices } from '../config/runtime-context';
import { normalizeProfile, resolveVertexContext } from '../config/runtime-context';

export async function runAuthCommand(argv: string[], services: CliServices): Promise<void> {
  const [subcommand, ...rest] = argv;

  if (!subcommand) {
    throw new CliUsageError('Missing auth subcommand. Use one of: login, status, logout.');
  }

  if (subcommand === 'login') {
    await runAuthLogin(rest, services);
    return;
  }

  if (subcommand === 'status') {
    await runAuthStatus(rest, services);
    return;
  }

  if (subcommand === 'logout') {
    await runAuthLogout(rest, services);
    return;
  }

  throw new CliUsageError(`Unknown auth subcommand "${subcommand}". Use one of: login, status, logout.`);
}

async function runAuthLogin(argv: string[], services: CliServices): Promise<void> {
  const { values, positionals } = parseCommandArgs(argv, {
    profile: { type: 'string' },
    'project-id': { type: 'string' },
    credentials: { type: 'string' },
    location: { type: 'string' },
    'model-id': { type: 'string' }
  });

  if (positionals.length > 0) {
    throw new CliUsageError(`Unexpected positional arguments: ${positionals.join(', ')}`);
  }

  const profile = normalizeProfile(optionalStringOption(values, 'profile'));
  const projectId = requireStringOption(values, 'project-id', '--project-id');
  const credentialsPath = requireStringOption(values, 'credentials', '--credentials');
  const location = optionalStringOption(values, 'location') ?? 'global';
  const modelId = optionalStringOption(values, 'model-id') ?? 'gemini-3-pro-image-preview';

  await services.profileStore.upsertProfile(profile, {
    projectId,
    credentialsPath,
    location,
    modelId
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        profile,
        saved: {
          projectId,
          credentialsPath,
          location,
          modelId
        }
      },
      null,
      2
    )
  );
}

async function runAuthStatus(argv: string[], services: CliServices): Promise<void> {
  const { values, positionals } = parseCommandArgs(argv, {
    profile: { type: 'string' }
  });

  if (positionals.length > 0) {
    throw new CliUsageError(`Unexpected positional arguments: ${positionals.join(', ')}`);
  }

  const profile = normalizeProfile(optionalStringOption(values, 'profile'));
  const stored = await services.profileStore.getProfile(profile);

  let resolved = null;
  let resolveError: string | null = null;
  try {
    resolved = await resolveVertexContext(services, { profile });
  } catch (error) {
    resolveError = error instanceof Error ? error.message : String(error);
  }

  console.log(
    JSON.stringify(
      {
        profile,
        stored,
        resolved,
        resolveError
      },
      null,
      2
    )
  );
}

async function runAuthLogout(argv: string[], services: CliServices): Promise<void> {
  const { values, positionals } = parseCommandArgs(argv, {
    profile: { type: 'string' }
  });

  if (positionals.length > 0) {
    throw new CliUsageError(`Unexpected positional arguments: ${positionals.join(', ')}`);
  }

  const profile = normalizeProfile(optionalStringOption(values, 'profile'));
  await services.profileStore.deleteProfile(profile);

  console.log(
    JSON.stringify(
      {
        ok: true,
        profile
      },
      null,
      2
    )
  );
}
