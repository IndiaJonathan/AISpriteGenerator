import { homedir } from 'node:os';
import path from 'node:path';

export type CliPaths = {
  configDir: string;
  configFile: string;
};

export function resolveCliPaths(env: NodeJS.ProcessEnv = process.env): CliPaths {
  const configDir = resolveConfigDir(env);

  return {
    configDir,
    configFile: path.join(configDir, 'config.json')
  };
}

function resolveConfigDir(env: NodeJS.ProcessEnv): string {
  const appName = 'spritegen-agent';

  if (process.platform === 'win32') {
    const appData = env.APPDATA?.trim();
    if (appData) {
      return path.join(appData, appName);
    }
  }

  const xdgConfigHome = env.XDG_CONFIG_HOME?.trim();
  if (xdgConfigHome) {
    return path.join(xdgConfigHome, appName);
  }

  return path.join(homedir(), '.config', appName);
}
