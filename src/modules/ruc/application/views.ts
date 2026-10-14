// What the presentation (src/app) may use of this context: the read model and the pure functions
// that compute the screens. Safe for the browser: nothing here touches a server.
export type { Activity, RucLists, SscoEntry, SunatFicha, TaxpayerCard } from '../domain/entities/Taxpayer.ts';
export { isRuc } from '../domain/entities/Taxpayer.ts';
export * from '../domain/policies.ts';
