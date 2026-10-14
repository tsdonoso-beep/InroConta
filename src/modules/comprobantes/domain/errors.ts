// What can go wrong reading the documents, as values (neverthrow Result), not exceptions.
export type ComprobantesError =
    { kind: 'source-missing'; message: string } | { kind: 'source-shape'; message: string } | { kind: 'source-failed'; message: string };

export const sourceFailed = (e: unknown): ComprobantesError => ({ kind: 'source-failed', message: e instanceof Error ? e.message : String(e) });
