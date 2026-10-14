// The URL of the documents, in a module WITHOUT 'use client': the server layout preloads it and
// the browser store fetches it, and a constant exported from a client module does not cross to
// the server (it arrives as a client reference, not a string).
export const DOCS_URL = '/api/comprobantes';
