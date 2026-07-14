import { rm, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import signatureSourcesJson from '../../data/content/signature-asset-sources.json';
import { gameCatalog } from '../../src/data/generated/gameCatalog';
import { validateAssetFiles } from '../lib/assetValidation';
import { loadPlayerAssetManifest } from '../lib/loadPlayerAssetManifest';
import {
  type SignatureSourceEntry,
  validateSignatureSources,
} from '../lib/signatureSourceValidation';

const signatureSources = signatureSourcesJson.sources as readonly SignatureSourceEntry[];

describe('canonical player asset files', () => {
  it('matches every manifest path, hash, and dimension without orphan files or component literals', async () => {
    const auditManifest = await loadPlayerAssetManifest();
    await expect(validateAssetFiles(auditManifest)).resolves.toEqual([]);
  });

  it('rejects manifest paths that escape the public asset directory before reading them', async () => {
    const auditManifest = await loadPlayerAssetManifest();
    const first = auditManifest.assets[0];
    const invalidManifest = {
      ...auditManifest,
      assets: auditManifest.assets.map((asset) => asset === first
        ? { ...asset, path: '/assets/../../../package.json' }
        : asset),
    };

    await expect(validateAssetFiles(invalidManifest)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'invalid-file',
        path: '/assets/../../../package.json',
        message: expect.stringContaining('escapes public/'),
      }),
    ]));
  });

  it('rejects canonical-looking asset paths that escape public through a symlink', async () => {
    const auditManifest = await loadPlayerAssetManifest();
    const first = auditManifest.assets[0];
    const publicPath = '/assets/cards/asset-validation-symlink.webp';
    const link = resolve(`public${publicPath}`);
    await rm(link, { force: true });
    await symlink(resolve('package.json'), link);
    try {
      const invalidManifest = {
        ...auditManifest,
        assets: auditManifest.assets.map((asset) => asset === first
          ? { ...asset, path: publicPath }
          : asset),
      };
      await expect(validateAssetFiles(invalidManifest)).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid-file',
          path: publicPath,
          message: expect.stringContaining('resolves outside public/'),
        }),
      ]));
    } finally {
      await rm(link, { force: true });
    }
  });

  it('audits all nine integrated Signature artworks and their exact CardVersion values', async () => {
    const auditManifest = await loadPlayerAssetManifest();
    const issues = await validateSignatureSources(gameCatalog, auditManifest);
    expect(issues.filter(({ severity }) => severity === 'error')).toEqual([]);
    expect(issues.filter(({ code }) => code === 'unmatched-signature-source')).toHaveLength(0);
    expect(issues.filter(({ code }) => code === 'missing-signature-source-original')).toEqual([
      expect.objectContaining({
        path: 'assets/Event Cards/Signature Series/PWHL/MPP-Signature-Series.png',
        severity: 'warning',
      }),
    ]);
  });

  it('rejects artwork metadata that drifts from the visible OVR or labels', async () => {
    const auditManifest = await loadPlayerAssetManifest();
    const corruptedSources = signatureSources.map((source, index) => index === 0
      ? {
        ...source,
        artwork: {
          ...(source.artwork as object),
          overall: 94,
        },
      }
      : source);
    const issues = await validateSignatureSources(gameCatalog, auditManifest, {
      sources: corruptedSources,
    });
    expect(issues).toContainEqual(expect.objectContaining({
      code: 'invalid-signature-source',
      path: 'assets/Event Cards/Signature Series/NHL/Cale-Makar-Signature-Series.png',
      message: expect.stringContaining('does not match its artwork ratings'),
    }));
  });

  it('rejects duplicate player and source-path inventory entries', async () => {
    const auditManifest = await loadPlayerAssetManifest();
    const duplicate = {
      ...signatureSources[1],
      playerId: signatureSources[0].playerId,
      sourcePath: signatureSources[0].sourcePath,
    };
    const issues = await validateSignatureSources(gameCatalog, auditManifest, {
      sources: [...signatureSources, duplicate],
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'invalid-signature-source',
        message: expect.stringContaining('playerId nhl-cale-makar is duplicated'),
      }),
      expect.objectContaining({
        code: 'invalid-signature-source',
        message: expect.stringContaining('sourcePath assets/Event Cards/Signature Series/NHL/Cale-Makar-Signature-Series.png is duplicated'),
      }),
    ]));
  });

  it('rejects source paths outside the approved source directories', async () => {
    const auditManifest = await loadPlayerAssetManifest();
    const unsafeSources = signatureSources.map((source, index) => index === 0
      ? { ...source, sourcePath: '../Cale-Makar-Signature-Series.png' }
      : source);
    const issues = await validateSignatureSources(gameCatalog, auditManifest, {
      sources: unsafeSources,
    });

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'invalid-signature-source',
      path: '../Cale-Makar-Signature-Series.png',
      message: expect.stringContaining('contained PNG'),
    }));
  });

  it('rejects raw PNGs missing from inventory and canonical assets missing an integrated entry', async () => {
    const auditManifest = await loadPlayerAssetManifest();
    const withoutIntegratedRaw = signatureSources.filter(
      ({ playerId }) => playerId !== 'nhl-jeremy-swayman',
    );
    const rawIssues = await validateSignatureSources(gameCatalog, auditManifest, {
      sources: withoutIntegratedRaw,
    });
    expect(rawIssues).toContainEqual(expect.objectContaining({
      code: 'uninventoried-signature-source',
      path: 'assets/Event Cards/Signature Series/NHL/Jeremy-Swayman-Signature-Series.png',
    }));

    const withoutIntegratedAssetSource = signatureSources.filter(
      ({ playerId }) => playerId !== 'pwhl-marie-philip-poulin',
    );
    const manifestIssues = await validateSignatureSources(gameCatalog, auditManifest, {
      sources: withoutIntegratedAssetSource,
    });
    expect(manifestIssues).toContainEqual(expect.objectContaining({
      code: 'invalid-signature-source',
      path: '/assets/players/pwhl/marie-philip-poulin/signature.webp',
      message: expect.stringContaining('no integrated source-inventory entry'),
    }));
  });
});
