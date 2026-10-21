// What the presentation (src/app) may use of this context: the read model and the pure functions
// that compute the screen. Safe for the browser: nothing here touches a server.
export type { Retention, RetentionDoc, Retentions, RetentionStatus } from '../domain/entities/Retention.ts';
export * from '../domain/policies/retentions.ts';
