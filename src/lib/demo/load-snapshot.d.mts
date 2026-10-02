import type pg from "pg";

export declare const SNAPSHOT_FILE: string;
export declare const MARKER: string;
export declare function pgConfig(url: string): { connectionString: string };
export declare function looksLikeDemoDatabase(client: pg.Client): Promise<boolean>;
export declare function userCount(client: pg.Client): Promise<number>;
export declare function isSnapshotLoaded(client: pg.Client): Promise<boolean>;
export declare function shiftDays(anchorIso: string, now?: Date): number;
export declare function shiftStatements(
  columns: { table_name: string; column_name: string; data_type: string }[],
  days: number,
): string[];
export declare const DATE_COLUMNS_SQL: string;
export declare function loadSnapshot(client: pg.Client, options?: { now?: Date }): Promise<void>;
export declare function dataAnchor(client: pg.Client): Promise<string | null>;
export declare function markLoaded(client: pg.Client, extra?: Record<string, unknown>): Promise<void>;
export declare function withClient<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T>;
