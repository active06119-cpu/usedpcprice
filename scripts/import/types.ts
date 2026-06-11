import { PartCondition, SnapshotSource } from "@prisma/client";

export interface RawSnapshot {
  partId: string;
  sourceUrl?: string | null;
  priceKrw: number;
  condition?: PartCondition | null;
  rawText?: string | null;
}

export type Importer = (batchId: string) => Promise<RawSnapshot[]>;

export type ImportRunner = (batchId: string) => Promise<number>;

export const IMPORT_SOURCE_ORDER: SnapshotSource[] = [
  SnapshotSource.DANAWA,
  SnapshotSource.BUNJANG,
  SnapshotSource.JOONGNA,
];
