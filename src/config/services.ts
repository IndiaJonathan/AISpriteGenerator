import { ProfileConfigStore } from './profile-config.store';
import type { CliServices } from './runtime-context';
import { resolveCliPaths } from '../utils/paths';

export async function createCliServices(env: NodeJS.ProcessEnv = process.env): Promise<CliServices> {
  const paths = resolveCliPaths(env);
  const profileStore = new ProfileConfigStore(paths.configFile);

  return {
    profileStore
  };
}
