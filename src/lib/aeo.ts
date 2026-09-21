/**
 * D1-backed SnapshotStore adapter for @jeldon/aeo-audit. The engine reads/writes
 * the whole rolling SnapshotStoreData; we persist it as one JSON blob (single
 * row, id='default') — the D1 analogue of the engine's FsSnapshotStore. This is
 * the "adapter, not assumption" boundary (Constitution Rule 5): the audit goes
 * through the engine's SnapshotStore interface, never direct vendor calls.
 */
import type { SnapshotStore, SnapshotStoreData } from "@jeldon/aeo-audit";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

const ROW_ID = "default";

export class D1SnapshotStore implements SnapshotStore {
  constructor(
    private readonly db: ReturnType<typeof getDb>,
    private readonly maxSnapshots = 52,
  ) {}

  async read(): Promise<SnapshotStoreData> {
    const empty: SnapshotStoreData = { lastUpdated: null, maxSnapshots: this.maxSnapshots, snapshots: [] };
    const row = await this.db
      .select()
      .from(schema.aeoAuditStore)
      .where(eq(schema.aeoAuditStore.id, ROW_ID))
      .get();
    if (!row?.data) return empty;
    try {
      const d = JSON.parse(row.data) as Partial<SnapshotStoreData>;
      return {
        lastUpdated: d.lastUpdated ?? null,
        maxSnapshots: d.maxSnapshots ?? this.maxSnapshots,
        snapshots: d.snapshots ?? [],
      };
    } catch {
      return empty;
    }
  }

  async write(data: SnapshotStoreData): Promise<void> {
    const json = JSON.stringify(data);
    const now = new Date().toISOString();
    await this.db
      .insert(schema.aeoAuditStore)
      .values({ id: ROW_ID, data: json, updatedAt: now })
      .onConflictDoUpdate({ target: schema.aeoAuditStore.id, set: { data: json, updatedAt: now } });
  }
}
