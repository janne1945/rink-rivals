import { access, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

import { parseCsv } from './lib/csv';
import {
  buildImportCandidate,
  overrideSchema,
  parseStatRows,
  type RatingOverride,
} from './lib/importPipeline';

interface CliOptions {
  readonly input: string;
  readonly output: string;
  readonly seasons: readonly [string, string, string];
  readonly overrides?: string;
  readonly force: boolean;
}

function usage(): string {
  return [
    'Usage:',
    '  pnpm catalog:import -- --input <stats.csv> --seasons <oldest,middle,newest> --output <candidate.json> [--overrides <overrides.json>] [--force]',
    '',
    'This command only reads local files and writes a review candidate. It never fetches stats or replaces gameCatalog.ts.',
  ].join('\n');
}

function parseArgs(args: readonly string[]): CliOptions {
  const values = new Map<string, string>();
  let force = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--force') {
      force = true;
      continue;
    }
    if (!argument?.startsWith('--')) {
      throw new Error(`Unexpected argument: ${argument ?? '(empty)'}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`);
    }
    values.set(argument.slice(2), value);
    index += 1;
  }

  const input = values.get('input');
  const output = values.get('output');
  const seasons = values.get('seasons')?.split(',').map((season) => season.trim());
  if (!input || !output || seasons?.length !== 3) {
    throw new Error(usage());
  }
  if (extname(output).toLowerCase() !== '.json') {
    throw new Error('Import output must be a .json review candidate');
  }

  return {
    input,
    output,
    seasons: [seasons[0], seasons[1], seasons[2]],
    overrides: values.get('overrides'),
    force,
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadOverrides(path: string | undefined): Promise<RatingOverride[]> {
  if (!path) return [];
  const input = JSON.parse(await readFile(resolve(path), 'utf8')) as unknown;
  if (!Array.isArray(input)) {
    throw new Error('Override file must contain a JSON array');
  }
  return input.map((entry, index) => {
    const result = overrideSchema.safeParse(entry);
    if (!result.success) {
      throw new Error(`Invalid override ${index + 1}: ${result.error.message}`);
    }
    return result.data;
  });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const outputPath = resolve(options.output);
  const approvedCatalogPath = resolve('src/data/generated/gameCatalog.ts');
  if (outputPath === approvedCatalogPath) {
    throw new Error('The import command cannot overwrite the manually approved TypeScript catalog');
  }
  if (!options.force && (await pathExists(outputPath))) {
    throw new Error(`Output already exists: ${outputPath}. Use a new path or explicit --force.`);
  }

  const csv = await readFile(resolve(options.input), 'utf8');
  const rows = parseStatRows(parseCsv(csv));
  const overrides = await loadOverrides(options.overrides);
  const candidate = buildImportCandidate(rows, {
    seasons: options.seasons,
    overrides,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(candidate, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }

  console.log(
    `Created review candidate for ${candidate.report.playersCreated} players at ${outputPath}.`,
  );
  console.log(
    `Warnings: ${candidate.report.warnings.length}. Status: ${candidate.report.approvalStatus}.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
