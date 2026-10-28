import { KardexView } from './kardex-view.tsx';

// Nothing to wait for on the server: the frame and the cards are code, and the kardex comes from
// the tab's store (read once, kardexStore).
export default function KardexPage() {
    return <KardexView />;
}
