import Dexie, { type Table } from "dexie";

import { parseOrCreateSaveGame } from "./migrations";
import type { SaveLoadResult } from "./migrations";
import { saveGameV2Schema } from "./saveSchema";
import type { SaveGameV2 } from "./saveSchema";

export type SaveUpdater = (current: SaveGameV2) => SaveGameV2;

export interface GameSaveRepository {
  load(): Promise<SaveGameV2>;
  inspect(): Promise<SaveLoadResult>;
  save(save: SaveGameV2): Promise<SaveGameV2>;
  update(updater: SaveUpdater): Promise<SaveGameV2>;
  clear(): Promise<void>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryGameSaveRepository implements GameSaveRepository {
  private raw: unknown;
  private updateQueue: Promise<void> = Promise.resolve();

  constructor(initialRaw?: unknown) {
    this.raw = clone(initialRaw);
  }

  async inspect(): Promise<SaveLoadResult> {
    const result = parseOrCreateSaveGame(clone(this.raw));
    return { ...result, save: clone(result.save) };
  }

  async load(): Promise<SaveGameV2> {
    return (await this.inspect()).save;
  }

  async save(save: SaveGameV2): Promise<SaveGameV2> {
    const validated = saveGameV2Schema.parse(clone(save));
    this.raw = clone(validated);
    return clone(validated);
  }

  async update(updater: SaveUpdater): Promise<SaveGameV2> {
    let result: SaveGameV2 | undefined;
    const operation = this.updateQueue.then(async () => {
      const current = await this.load();
      result = await this.save(updater(current));
    });
    this.updateQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    await operation;
    if (!result) throw new Error("Save update did not produce a result.");
    return result;
  }

  async clear(): Promise<void> {
    await this.updateQueue;
    this.raw = undefined;
  }
}

interface PersistedSaveRecord {
  key: "primary";
  payload: unknown;
}

class RinkRivalsSaveDatabase extends Dexie {
  saves!: Table<PersistedSaveRecord, string>;

  constructor(databaseName: string) {
    super(databaseName);
    this.version(1).stores({ saves: "&key" });
  }
}

/** IndexedDB-backed repository used by the app. All writes are validated. */
export class DexieGameSaveRepository implements GameSaveRepository {
  private readonly database: RinkRivalsSaveDatabase;

  constructor(databaseName = "rink-rivals") {
    this.database = new RinkRivalsSaveDatabase(databaseName);
  }

  async inspect(): Promise<SaveLoadResult> {
    const record = await this.database.saves.get("primary");
    return parseOrCreateSaveGame(record?.payload);
  }

  async load(): Promise<SaveGameV2> {
    return (await this.inspect()).save;
  }

  async save(save: SaveGameV2): Promise<SaveGameV2> {
    const validated = saveGameV2Schema.parse(save);
    await this.database.saves.put({ key: "primary", payload: validated });
    return validated;
  }

  async update(updater: SaveUpdater): Promise<SaveGameV2> {
    return this.database.transaction("rw", this.database.saves, async () => {
      const record = await this.database.saves.get("primary");
      const current = parseOrCreateSaveGame(record?.payload).save;
      const updated = saveGameV2Schema.parse(updater(current));
      await this.database.saves.put({ key: "primary", payload: updated });
      return updated;
    });
  }

  async clear(): Promise<void> {
    await this.database.saves.delete("primary");
  }

  close(): void {
    this.database.close();
  }
}
