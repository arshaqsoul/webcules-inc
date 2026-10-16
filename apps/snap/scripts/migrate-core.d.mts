export declare const TARGETS: {
  staging: "webcules-snap-staging";
  production: "webcules-snap";
};
export declare function computePending(files: string[], appliedSet: Set<string> | string[]): string[];
export declare function orphanedLedgerRows(files: string[], appliedSet: Set<string> | string[]): string[];
