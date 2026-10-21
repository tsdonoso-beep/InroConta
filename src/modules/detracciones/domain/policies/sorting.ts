// The orders the two tables of Detracciones offer. The defaults are the old view's: the proofs
// newest payment first (latestFirst), the invoices without proof oldest first (the most overdue).
import type { MissingProof, Proof } from '../entities/Proof.ts';
import { latestFirst } from './proofs.ts';

export type ProofSort = 'paid-desc' | 'paid-asc' | 'deposit-desc' | 'supplier';
export type MissingSort = 'issued-asc' | 'issued-desc' | 'detraction-desc' | 'supplier';

export function sortProofs(proofs: Proof[], sort: ProofSort): Proof[] {
    if (sort === 'paid-desc') return latestFirst(proofs);
    const by: Record<Exclude<ProofSort, 'paid-desc'>, (a: Proof, b: Proof) => number> = {
        'paid-asc': (a, b) => a.paidOn.localeCompare(b.paidOn),
        'deposit-desc': (a, b) => (b.deposited ?? 0) - (a.deposited ?? 0),
        supplier: (a, b) => a.supplierName.localeCompare(b.supplierName, 'es') || b.paidOn.localeCompare(a.paidOn),
    };
    return [...proofs].sort(by[sort]);
}

/** `rows` come oldest first from filterDetractions; the other orders sort a copy. */
export function sortMissing(rows: MissingProof[], sort: MissingSort): MissingProof[] {
    if (sort === 'issued-asc') return rows;
    const by: Record<Exclude<MissingSort, 'issued-asc'>, (a: MissingProof, b: MissingProof) => number> = {
        'issued-desc': (a, b) => b.issuedOn.localeCompare(a.issuedOn),
        'detraction-desc': (a, b) => (b.detraction ?? 0) - (a.detraction ?? 0),
        supplier: (a, b) => a.name.localeCompare(b.name, 'es') || a.issuedOn.localeCompare(b.issuedOn),
    };
    return [...rows].sort(by[sort]);
}
