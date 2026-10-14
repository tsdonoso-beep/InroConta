import { FacturaView } from './factura-view.tsx';

// Nothing to wait for on the server: the documents come from the tab's store and the lines of an
// invoice are asked when it is opened.
export default function FacturaPage() {
    return <FacturaView />;
}
