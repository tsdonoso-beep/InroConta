// What the presentation (src/app) may use of this context: the read model and the pure functions
// that compute the screens. Safe for the browser: nothing here touches a server.
export type { ChangesRead, Folder, FoldersRead, NoOcRead, FolderChange, NoOcInvoice, SourceCopy } from '../domain/entities/Folder.ts';
export type { ComexSource, FolderDetail, FolderFile, PurchaseSource, WarehouseSlip } from '../domain/entities/FolderDetail.ts';
export * from '../domain/policies/folders.ts';
export * from '../domain/policies/no-oc.ts';
export * from '../domain/policies/changes.ts';
export * from '../domain/policies/badges.ts';
