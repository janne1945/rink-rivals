import { createHash } from 'node:crypto';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import sharp from 'sharp';

import type { PlayerAssetManifest } from '../../src/domain/cards/assets';

export type AssetFileIssueCode =
  | 'component-path-literal'
  | 'invalid-file'
  | 'missing-file'
  | 'orphan-file';

export interface AssetFileIssue {
  readonly code: AssetFileIssueCode;
  readonly path: string;
  readonly message: string;
}

const PUBLIC_ROOT = resolve('public');
const PLAYER_ASSET_ROOT = resolve(PUBLIC_ROOT, 'assets/players');
const SOURCE_ROOT = resolve('src');
const IMAGE_EXTENSION = /\.(?:avif|jpe?g|png|svg|webp)$/i;
const COMPONENT_ASSET_LITERAL = /(?:\/assets\/players\/|neutral-card\.svg|(?:base|signature)\.(?:avif|jpe?g|png|webp))/i;

function sha256(input: Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

function publicFile(publicPath: string): string {
  if (!publicPath.startsWith('/assets/') || publicPath.includes('\\')) {
    throw new Error(`Asset path is outside the approved public asset namespace: ${publicPath}`);
  }
  const file = resolve(PUBLIC_ROOT, publicPath.slice(1));
  const nestedPath = relative(PUBLIC_ROOT, file);
  if (nestedPath === '' || nestedPath === '..' || nestedPath.startsWith(`..${sep}`)
    || isAbsolute(nestedPath)) {
    throw new Error(`Asset path escapes public/: ${publicPath}`);
  }
  return file;
}

function portablePath(path: string): string {
  return path.split(sep).join('/');
}

async function assertPublicRealPath(file: string): Promise<void> {
  const [canonicalRoot, canonicalFile] = await Promise.all([
    realpath(PUBLIC_ROOT),
    realpath(file),
  ]);
  const nestedPath = relative(canonicalRoot, canonicalFile);
  if (nestedPath === '' || nestedPath === '..' || nestedPath.startsWith(`..${sep}`)
    || isAbsolute(nestedPath)) {
    throw new Error(`Asset file resolves outside public/: ${file}`);
  }
}

async function filesUnder(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) => {
      const path = resolve(root, entry.name);
      return entry.isDirectory() ? filesUnder(path) : [path];
    }));
    return nested.flat();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function validateManifestFile(
  expected: {
    readonly path: string;
    readonly width: number;
    readonly height: number;
    readonly sha256: string;
  },
): Promise<AssetFileIssue[]> {
  const issues: AssetFileIssue[] = [];
  try {
    const file = publicFile(expected.path);
    await assertPublicRealPath(file);
    const [payload, metadata] = await Promise.all([readFile(file), sharp(file).metadata()]);
    if (sha256(payload) !== expected.sha256) {
      issues.push({
        code: 'invalid-file',
        path: expected.path,
        message: `Asset payload hash does not match the generated manifest for ${expected.path}.`,
      });
    }
    if (metadata.width !== expected.width || metadata.height !== expected.height) {
      issues.push({
        code: 'invalid-file',
        path: expected.path,
        message: `Asset dimensions do not match the generated manifest for ${expected.path}.`,
      });
    }
    if ((await stat(file)).size === 0) {
      issues.push({ code: 'invalid-file', path: expected.path, message: `${expected.path} is empty.` });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      issues.push({ code: 'missing-file', path: expected.path, message: `${expected.path} does not exist.` });
    } else {
      issues.push({
        code: 'invalid-file',
        path: expected.path,
        message: `${expected.path} could not be decoded: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  return issues;
}

export async function validateAssetFiles(
  manifest: PlayerAssetManifest,
): Promise<readonly AssetFileIssue[]> {
  const expected = [manifest.fallback, ...manifest.assets];
  const issues = (await Promise.all(expected.map(validateManifestFile))).flat();
  const registeredPaths = new Set(manifest.assets.map(({ path }) => path));
  const playerFiles = (await filesUnder(PLAYER_ASSET_ROOT)).filter((path) => IMAGE_EXTENSION.test(path));
  for (const file of playerFiles) {
    const publicPath = `/${portablePath(relative(PUBLIC_ROOT, file))}`;
    if (!registeredPaths.has(publicPath)) {
      issues.push({
        code: 'orphan-file',
        path: publicPath,
        message: `${publicPath} is not registered to a player asset manifest entry.`,
      });
    }
  }

  const componentFiles = (await filesUnder(SOURCE_ROOT)).filter((path) => path.endsWith('.tsx'));
  for (const file of componentFiles) {
    const source = await readFile(file, 'utf8');
    if (COMPONENT_ASSET_LITERAL.test(source)) {
      const sourcePath = portablePath(relative(resolve('.'), file));
      issues.push({
        code: 'component-path-literal',
        path: sourcePath,
        message: `${sourcePath} contains a card asset filename or player asset path instead of using the resolver.`,
      });
    }
  }

  return issues;
}
