import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type StoredProfileConfig = {
  projectId?: string;
  credentialsPath?: string;
  location?: string;
  modelId?: string;
};

type ProfileConfigFile = {
  version: 1;
  profiles: Record<string, StoredProfileConfig>;
};

const DEFAULT_CONFIG: ProfileConfigFile = {
  version: 1,
  profiles: {}
};

export class ProfileConfigStore {
  constructor(private readonly configFilePath: string) {}

  async getProfile(profile: string): Promise<StoredProfileConfig> {
    const config = await this.readConfig();
    return config.profiles[profile] ?? {};
  }

  async upsertProfile(profile: string, patch: StoredProfileConfig): Promise<StoredProfileConfig> {
    const config = await this.readConfig();
    const current = config.profiles[profile] ?? {};
    const merged: StoredProfileConfig = {
      ...current,
      ...patch
    };

    if (!merged.projectId) {
      delete merged.projectId;
    }
    if (!merged.credentialsPath) {
      delete merged.credentialsPath;
    }
    if (!merged.location) {
      delete merged.location;
    }
    if (!merged.modelId) {
      delete merged.modelId;
    }

    config.profiles[profile] = merged;
    await this.writeConfig(config);
    return merged;
  }

  async deleteProfile(profile: string): Promise<void> {
    const config = await this.readConfig();
    if (!(profile in config.profiles)) {
      return;
    }

    delete config.profiles[profile];
    await this.writeConfig(config);
  }

  private async readConfig(): Promise<ProfileConfigFile> {
    try {
      const source = await readFile(this.configFilePath, 'utf8');
      const parsed = JSON.parse(source) as Partial<ProfileConfigFile>;
      if (parsed.version !== 1 || !parsed.profiles || typeof parsed.profiles !== 'object') {
        return { ...DEFAULT_CONFIG };
      }

      return {
        version: 1,
        profiles: parsed.profiles as Record<string, StoredProfileConfig>
      };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  private async writeConfig(config: ProfileConfigFile): Promise<void> {
    await mkdir(dirname(this.configFilePath), { recursive: true });
    await writeFile(this.configFilePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  }
}
