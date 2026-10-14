import { LegajoView } from './legajo-view.tsx';

// Nothing to wait for on the server: the folders come from the tab's store (foldersStore).
export default function LegajoPage() {
    return <LegajoView />;
}
