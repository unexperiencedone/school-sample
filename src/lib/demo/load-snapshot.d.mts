import type pg from "pg";

export declare const SNAPSHOT_FILE: string;
export declare const MARKER: string;
export declare function pgConfig(url: string): { connectionString: string };
export declare function isSnapshotLoaded(client: pg.Client): Promise<boolean>;
export declare function loadSnapshot(client: pg.Client): Promise<void>;
export declare function markLoaded(client: pg.Client): Promise<void>;
export declare function withClient<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T>;
