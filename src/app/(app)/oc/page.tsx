import { OcView } from './oc-view.tsx';

// Nothing to wait for on the server: the documents come from the tab's store.
export default function OcPage() {
    return <OcView />;
}
