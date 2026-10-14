import { CambiosView } from './cambios-view.tsx';

// Nothing to wait for on the server: the changes come from the tab's board store.
export default function CambiosPage() {
    return <CambiosView />;
}
