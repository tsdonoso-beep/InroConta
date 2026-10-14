import { ResumenView } from './resumen-view.tsx';

// Nothing to wait for on the server: the frame and the cards are code, and the documents come
// from the tab's store (read once, shared by every SUNAT screen).
export default function ResumenPage() {
    return <ResumenView />;
}
