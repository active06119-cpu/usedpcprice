export interface PriceBand {
  usedLow: number;
  usedMid: number;
  usedHigh: number;
  sampleSize: number;
}

export interface ResolvedDbPrice extends PriceBand {
  newPrice: number | null;
  buyoutBasedLow: boolean;
}

export interface ResolvedDbPriceInput {
  partId: string;
  partName: string;
  category: string;
  minSamples?: number;
}
