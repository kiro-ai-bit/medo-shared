import type { Queryable } from './types.js';

export const PROCESSED_MARKERS_DDL = `
CREATE TABLE IF NOT EXISTS processed_event_markers (
  event_id uuid NOT NULL,
  action text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, action)
)`;

export const PROCESSED_MARKERS_INDEX_DDL = `
CREATE INDEX IF NOT EXISTS idx_processed_markers_processed_at
  ON processed_event_markers (processed_at)
`;

export async function ensureProcessedMarkers(db: Queryable): Promise<void> {
  await db.query(PROCESSED_MARKERS_DDL);
  await db.query(PROCESSED_MARKERS_INDEX_DDL);
}

export async function isProcessed(
  db: Queryable,
  key: { eventId: string; action: string },
): Promise<boolean> {
  const res = await db.query<{ event_id: string }>(
    `SELECT event_id FROM processed_event_markers WHERE event_id = $1 AND action = $2`,
    [key.eventId, key.action],
  );
  return res.rows.length > 0;
}

export async function markProcessed(
  db: Queryable,
  key: { eventId: string; action: string },
): Promise<void> {
  await db.query(
    `INSERT INTO processed_event_markers (event_id, action) VALUES ($1, $2)
     ON CONFLICT (event_id, action) DO NOTHING`,
    [key.eventId, key.action],
  );
}

export async function purgeProcessedMarkers(db: Queryable, before: Date): Promise<number> {
  const res = await db.query<{ event_id: string }>(
    `DELETE FROM processed_event_markers WHERE processed_at < $1 RETURNING event_id`,
    [before.toISOString()],
  );
  return res.rows.length;
}
