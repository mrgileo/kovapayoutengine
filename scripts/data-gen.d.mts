export interface DatasetConfig {
  start: string;
  days: number;
  perDay: [number, number];
  seed: number;
}
export interface Planted {
  notOnStatement: number[];
  shortPaid: number[];
  overPaid: number[];
  duplicates: number[];
  remittedUndelivered: number[];
  remittedNotRecorded: number[];
  deliveredNeverRemitted: number[];
  recordedNotOnStatement: number[];
  stockVariance: Record<string, number>;
  adReportedDifferences: string[];
  adReportedMissing: string[];
  bank?: {
    cycle: string | null;
    expectedTotal?: number;
    people?: number;
    missing?: string[];
    wrongAmount?: Record<string, number>;
    duplicate?: string[];
    unknownPayees?: number;
  };
}
export interface Expected {
  config: DatasetConfig;
  asOf: string;
  openWeekStart: string;
  counts: {
    products: number;
    staff: number;
    orders: number;
    leads: number;
    adRows: number;
    adSpendTotal: number;
    purchaseOrders: number;
    courierLines: number;
    stages: Record<string, number>;
  };
  planted: Planted;
  deliveryFee: number;
}
export interface Dataset {
  files: Record<string, string>;
  expected: Expected;
}
export const DATASETS: Record<"medium" | "small", DatasetConfig>;
export function generateDataset(cfg: DatasetConfig): Dataset;
export function expectedText(expected: Expected): string;
export function generateBadFiles(): { files: Record<string, string>; errorLines: Record<string, Record<number, string>> };
