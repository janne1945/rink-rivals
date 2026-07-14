import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { PlayerAssetManifest } from '../../src/domain/cards/assets';

const AUDIT_MANIFEST_PATH = resolve('src/assets/generated/playerAssetManifest.json');

export async function loadPlayerAssetManifest(): Promise<PlayerAssetManifest> {
  return JSON.parse(await readFile(AUDIT_MANIFEST_PATH, 'utf8')) as PlayerAssetManifest;
}
