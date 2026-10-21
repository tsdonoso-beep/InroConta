import { RetencionesView } from './retenciones-view.tsx';

// Nothing to wait for on the server: the frame and the cards are code, and the CRE come from the
// tab's store (read once, retentionsStore).
export default function RetencionesPage() {
    return <RetencionesView />;
}
