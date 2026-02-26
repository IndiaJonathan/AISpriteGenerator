import { access } from 'node:fs/promises';
import { CliUsageError } from '../utils/errors';
import { ProfileConfigStore } from './profile-config.store';

const DEFAULT_MODEL_ID = 'gemini-3-pro-image-preview';
const DEFAULT_LOCATION = 'global';

export type CliServices = {
  profileStore: ProfileConfigStore;
};

export type ResolvedVertexContext = {
  profile: string;
  projectId: string;
  credentialsPath: string;
  location: string;
  modelId: string;
};

export type ResolveVertexContextOptions = {
  profile?: string;
  projectId?: string;
  credentialsPath?: string;
  location?: string;
  modelId?: string;
  env?: NodeJS.ProcessEnv;
};

export async function resolveVertexContext(
  services: CliServices,
  options: ResolveVertexContextOptions = {}
): Promise<ResolvedVertexContext> {
  const env = options.env ?? process.env;
  const profile = normalizeProfile(options.profile ?? env.SPRITEGEN_AGENT_PROFILE);
  const stored = await services.profileStore.getProfile(profile);

  const projectId =
    (options.projectId ?? env.VERTEX_PROJECT_ID ?? stored.projectId ?? '').trim();
  const credentialsPath =
    (
      options.credentialsPath ??
      env.GOOGLE_APPLICATION_CREDENTIALS ??
      stored.credentialsPath ??
      ''
    ).trim();
  const location =
    (options.location ?? env.VERTEX_LOCATION ?? stored.location ?? DEFAULT_LOCATION).trim() || DEFAULT_LOCATION;
  const modelId =
    (options.modelId ?? env.VERTEX_MODEL_ID ?? stored.modelId ?? DEFAULT_MODEL_ID).trim() || DEFAULT_MODEL_ID;

  if (!projectId) {
    throw new CliUsageError(
      'Missing Vertex project id. Set VERTEX_PROJECT_ID or run "spritegen-agent auth login --project-id <id> ...".'
    );
  }

  if (!credentialsPath) {
    throw new CliUsageError(
      'Missing credentials path. Set GOOGLE_APPLICATION_CREDENTIALS or run "spritegen-agent auth login --credentials <path> ...".'
    );
  }

  try {
    await access(credentialsPath);
  } catch {
    throw new CliUsageError(`GOOGLE_APPLICATION_CREDENTIALS does not exist or is not readable: "${credentialsPath}".`);
  }

  return {
    profile,
    projectId,
    credentialsPath,
    location,
    modelId
  };
}

export function normalizeProfile(profile: string | undefined): string {
  const normalized = profile?.trim() ?? '';
  return normalized || 'default';
}
