import { isValidNewPrice, priceRangeByCategory, shouldPersistUsedPrice } from "@/lib/engine/pricing/guards";
import { isValidPartName, type PersistCandidate, type PartitionResult } from "@/lib/ingest/used-listing-guard";

export type SnapshotPersistCandidate = PersistCandidate & {
  condition?: string | null;
};

export function canPersistSnapshot(row: SnapshotPersistCandidate): boolean {
  if (!isValidPartName(row.name)) return false;
  if (typeof row.priceKrw !== "number" || !Number.isFinite(row.priceKrw) || row.priceKrw <= 0) {
    return false;
  }

  const generic = priceRangeByCategory(row.category);
  if (row.priceKrw < generic.min || row.priceKrw > generic.max) return false;

  if ((row.condition ?? "").toUpperCase() === "NEW") {
    return isValidNewPrice(row.priceKrw, row.name, row.category);
  }

  return shouldPersistUsedPrice(row.priceKrw, row.name, row.category);
}

export function partitionPersistableSnapshots<T extends SnapshotPersistCandidate>(
  rows: T[],
): PartitionResult<T> {
  const kept: T[] = [];
  const rejected: PartitionResult<T>["rejected"] = [];

  for (const row of rows) {
    if (!isValidPartName(row.name)) {
      rejected.push({ name: row.name, priceKrw: row.priceKrw, reason: "invalid_name" });
      continue;
    }
    if (typeof row.priceKrw !== "number" || !Number.isFinite(row.priceKrw) || row.priceKrw <= 0) {
      rejected.push({ name: row.name, priceKrw: row.priceKrw, reason: "no_price" });
      continue;
    }
    if (!canPersistSnapshot(row)) {
      rejected.push({ name: row.name, priceKrw: row.priceKrw, reason: "price_out_of_range" });
      continue;
    }
    kept.push(row);
  }

  return { kept, rejected };
}
