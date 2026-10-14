import { DetraccionesView } from './detracciones-view.tsx';

// Nothing to wait for on the server: the frame and the cards are code, and the proofs come from
// the tab's store (read once, detractionsStore).
export default function DetraccionesPage() {
    return <DetraccionesView />;
}
