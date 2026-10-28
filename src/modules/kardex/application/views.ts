// What the presentation (src/app) may use of this context: the read model and the pure functions
// that compute the screen. Safe for the browser: nothing here touches a server.
export type { KardexChange, KardexChangeType, KardexMonth, KardexRead } from '../domain/entities/Kardex.ts';
export { KARDEX_DAYS } from '../domain/entities/Kardex.ts';
export * from '../domain/policies/kardex.ts';
