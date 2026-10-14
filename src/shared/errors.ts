// What a read can fail with, as a value (neverthrow Result), shared by every context: the
// message is in words for the screen; the raw error went to the log where it happened.
export interface SourceError {
    kind: 'source-missing' | 'source-shape' | 'source-failed' | 'not-found';
    message: string;
}
