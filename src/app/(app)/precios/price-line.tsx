// The price of a product over time, as a small line: red if it went up, green if it went down.
// The port of linea() of the Apps Script view.
const COLOR = { up: 'stroke-danger fill-danger', down: 'stroke-success fill-success', same: 'stroke-ink-3 fill-ink-3' };

export function PriceLine({ prices, width = 120, height = 34 }: { prices: [string, number][]; width?: number; height?: number }) {
    if (prices.length < 2) return <span className="text-xs text-ink-3">una sola compra</span>;
    const v = prices.map((p) => p[1]);
    const min = Math.min(...v),
        range = Math.max(...v) - min || 1;
    const pts = v.map((y, i) => [4 + (i * (width - 8)) / (v.length - 1), height - 4 - ((y - min) / range) * (height - 8)]);
    const [lx, ly] = pts[pts.length - 1];
    const color = COLOR[v[v.length - 1] === v[0] ? 'same' : v[v.length - 1] > v[0] ? 'up' : 'down'];
    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={color}>
            <polyline
                points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
                fill="none"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            <circle cx={lx.toFixed(1)} cy={ly.toFixed(1)} r="3" stroke="none" />
        </svg>
    );
}
