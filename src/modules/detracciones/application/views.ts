// What the presentation (src/app) may use of this context: the read model and the pure functions
// that compute the screen. Safe for the browser: nothing here touches a server.
export type { Detractions, Direction, MissingProof, Proof } from '../domain/entities/Proof.ts';
export * from '../domain/policies/proofs.ts';
export * from '../domain/policies/sorting.ts';
