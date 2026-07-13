import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type ExpectedMigration = {
  version: string;
  name: string;
  sha256: string;
};

const expectedMigrations: readonly ExpectedMigration[] = [
  {
    version: "20260713030446",
    name: "account_and_starter_team",
    sha256: "374837c8c427d7c976b1ed0c3cd54e257e9f89c0fc056a2e3de7a284424b7455",
  },
  {
    version: "20260713030615",
    name: "harden_account_schema",
    sha256: "bd00d7a086a386d2440be1310dc114c1778320ec7d5900ee64faf875aebe89bc",
  },
  {
    version: "20260713035200",
    name: "atomic_match_settlement",
    sha256: "05b28f6cb7b00cc485f2f20363c418139d7b56228a4da7ed91d0f612554530a3",
  },
  {
    version: "20260713035355",
    name: "fix_settle_match_parameter_resolution",
    sha256: "966a89648bcc913b723c0709e44ca66a32072506ca35adc265c7e74e339ff978",
  },
  {
    version: "20260713035431",
    name: "fix_settle_match_conflict_target",
    sha256: "966a89648bcc913b723c0709e44ca66a32072506ca35adc265c7e74e339ff978",
  },
  {
    version: "20260713040004",
    name: "index_match_reward_foreign_key",
    sha256: "a60289e20f46be7f04376ca4b2a43eac270a1654eabdfb8bb149d90d54af10b7",
  },
  {
    version: "20260713200005",
    name: "complete_mvp_server_authority",
    sha256: "ed0e0a1331ea7fdcf6c01aeeae6eac26abfec1b882765ed8ef23e6a98d01caea",
  },
  {
    version: "20260713200520",
    name: "index_mvp_foreign_keys",
    sha256: "c96e41401ad94ff22c37d301ab4865412fd49165ac5291a6a26d986708453155",
  },
];

const knownDuplicateBodyGroups = new Set([
  [
    "20260713035355_fix_settle_match_parameter_resolution.sql",
    "20260713035431_fix_settle_match_conflict_target.sql",
  ]
    .sort()
    .join("|"),
]);

const migrationsDirectory = fileURLToPath(
  new URL("../supabase/migrations/", import.meta.url),
);
const migrationPattern = /^(\d{14})_([a-z0-9_]+)\.sql$/;
const actualFiles = readdirSync(migrationsDirectory)
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort();
const expectedFiles = expectedMigrations.map(
  ({ version, name }) => `${version}_${name}.sql`,
);
const errors: string[] = [];

if (actualFiles.join("\n") !== expectedFiles.join("\n")) {
  errors.push(
    [
      "Migration version/name order differs from the reconciled history.",
      `Expected:\n  ${expectedFiles.join("\n  ")}`,
      `Actual:\n  ${actualFiles.join("\n  ")}`,
    ].join("\n"),
  );
}

const versions = new Map<string, string[]>();
const filesByHash = new Map<string, string[]>();

for (const fileName of actualFiles) {
  const match = migrationPattern.exec(fileName);
  if (!match) {
    errors.push(`Invalid migration filename: ${fileName}`);
    continue;
  }

  const version = match[1];
  const filesAtVersion = versions.get(version) ?? [];
  filesAtVersion.push(fileName);
  versions.set(version, filesAtVersion);

  const body = readFileSync(`${migrationsDirectory}/${fileName}`);
  const hash = createHash("sha256").update(body).digest("hex");
  const filesWithBody = filesByHash.get(hash) ?? [];
  filesWithBody.push(fileName);
  filesByHash.set(hash, filesWithBody);

  const expected = expectedMigrations.find(
    (migration) => `${migration.version}_${migration.name}.sql` === fileName,
  );
  if (expected && hash !== expected.sha256) {
    errors.push(
      `SQL body drift for ${fileName}: expected ${expected.sha256}, got ${hash}`,
    );
  }
}

for (const [version, files] of versions) {
  if (files.length > 1) {
    errors.push(`Duplicate migration version ${version}: ${files.join(", ")}`);
  }
}

for (const files of filesByHash.values()) {
  if (files.length < 2) {
    continue;
  }

  const group = files.sort().join("|");
  if (knownDuplicateBodyGroups.has(group)) {
    console.warn(`Known duplicate SQL body: ${files.join(", ")}`);
  } else {
    errors.push(`Unexpected duplicate SQL body: ${files.join(", ")}`);
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Migration history check passed for ${expectedMigrations.length} reconciled migrations.`,
  );
}
