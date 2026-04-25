#!/usr/bin/env node

import { runAuthCommand } from './commands/auth';
import { runEditCommand } from './commands/edit';
import { runGenerateCommand } from './commands/generate';
import { runInstallCommand } from './commands/install';
import { createCliServices } from './config/services';
import { CliError, CliUsageError } from './utils/errors';

async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const [command, ...rest] = argv;

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    printUsage();
    return 0;
  }

  if (command === '--version' || command === '-v') {
    printVersion();
    return 0;
  }

  const services = await createCliServices();

  if (command === 'auth') {
    await runAuthCommand(rest, services);
    return 0;
  }

  if (command === 'generate') {
    const result = await runGenerateCommand(rest, services);
    return result.failedCount > 0 ? 1 : 0;
  }

  if (command === 'edit') {
    const result = await runEditCommand(rest, services);
    return result.failedCount > 0 ? 1 : 0;
  }

  if (command === 'install') {
    await runInstallCommand(rest);
    return 0;
  }

  throw new CliUsageError(`Unknown command "${command}".`);
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    if (error instanceof CliError) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            error: {
              name: error.name,
              message: error.message,
              exitCode: error.exitCode
            }
          },
          null,
          2
        )
      );
      process.exitCode = error.exitCode;
      return;
    }

    console.log(
      JSON.stringify(
        {
          ok: false,
          error: {
            name: error instanceof Error ? error.name : 'Error',
            message: error instanceof Error ? error.message : String(error),
            exitCode: 1
          }
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  });

function printVersion(): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const packageJson = require('../package.json') as { version?: string };
  console.log(packageJson.version ?? '0.0.0');
}

function printUsage(): void {
  console.log('aispritegenerator-cli (spritegen-agent alias)');
  console.log('');
  console.log('Usage:');
  console.log(
    '  aispritegenerator-cli generate --prompt <text> --count <n> [--width <n>] [--height <n>] [--transparent] [--alpha-mode edited|source|extract] [--formats <csv>] [--output-dir <path>] [--prefix <name>] [--seed-start <n>] [--profile <name>] [--project-id <id>] [--credentials <path>] [--location <loc>] [--model-id <id>] [--timeout-ms <n>] [--retry-max-attempts <n>] [--retry-initial-delay-ms <n>]'
  );
  console.log(
    '  aispritegenerator-cli edit --input-image <path> --prompt <text> --count <n> [--width <n>] [--height <n>] [--transparent] [--alpha-mode edited|source|extract] [--formats <csv>] [--output-dir <path>] [--prefix <name>] [--seed-start <n>] [--profile <name>] [--project-id <id>] [--credentials <path>] [--location <loc>] [--model-id <id>] [--timeout-ms <n>] [--retry-max-attempts <n>] [--retry-initial-delay-ms <n>]'
  );
  console.log('');
  console.log('  aispritegenerator-cli auth login --project-id <id> --credentials <path> [--location <loc>] [--model-id <id>] [--profile <name>]');
  console.log('  aispritegenerator-cli auth status [--profile <name>]');
  console.log('  aispritegenerator-cli auth logout [--profile <name>]');
  console.log('  aispritegenerator-cli install [--skills] [--global] [--target <path>] [--force]');
  console.log('');
  console.log('Environment overrides:');
  console.log('  SPRITEGEN_AGENT_PROFILE, VERTEX_PROJECT_ID, GOOGLE_APPLICATION_CREDENTIALS, VERTEX_LOCATION, VERTEX_MODEL_ID');
}
