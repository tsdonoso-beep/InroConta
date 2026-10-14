import { RucView } from './ruc-view.tsx';

// Nothing to wait for on the server: the RUC cards and the SSCO list come from the tab's store,
// and the full SUNAT ficha of a RUC is asked when it is opened. The RUC goes in the URL
// (?ruc=…), read by the view in the browser.
export default function RucPage() {
    return <RucView />;
}
