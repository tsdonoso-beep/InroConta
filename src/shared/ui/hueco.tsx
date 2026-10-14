// The gap where a value is still travelling. It covers ONLY what depends on the data: titles,
// labels, buttons and the shape of a card are code and are drawn for real (GRAMA's rule: the
// skeleton IS the final screen). No blur. Each gap gets both its sizes, from the element it
// replaces, so nothing moves when the value arrives.
export function Hueco({ className }: { className: string }) {
    return <span aria-hidden="true" className={`inline-block animate-pulse rounded-md bg-ink/10 align-middle ${className}`} />;
}
