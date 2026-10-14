// What the presentation (src/app) may use of this context without reaching into domain/ or
// infrastructure/ (dependency-cruiser enforces it): the read model and the pure functions
// that compute the screens. Safe for the browser: nothing here touches a server.
export type { DetractionProof, Doc, DocKind, DocsSnapshot, Origin } from '../domain/entities/Doc.ts';
export { monthsOf } from '../domain/entities/Doc.ts';
export type { SalesTaxMonth } from './ports/SalesTaxPort.ts';
export {
    ALL_IN_PEN,
    currencies,
    heatMap,
    kindSlices,
    kpis,
    monthBars,
    ofPeriod,
    periodMonths,
    scope,
    type Filters,
    type HeatRow,
    type KindSlice,
    type Kpis,
    type MonthBar,
} from '../domain/policies/summary.ts';
export { decodeDocs, encodeDocs, type WireDocs } from './wire.ts';
export type { Product, ProductList } from '../domain/policies/products.ts';
export type { DocumentLine, DocumentLines } from '../domain/policies/document-lines.ts';
export * from '../domain/policies/search.ts';
export * from '../domain/policies/purchases.ts';
