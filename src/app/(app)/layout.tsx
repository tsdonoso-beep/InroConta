import { preload } from 'react-dom';
import { requireUser } from '../../shared/auth/session.ts';
import { Sidebar } from './_components/sidebar.tsx';
import { DOCS_URL } from './_comprobantes/docs-url.ts';
import { DocsWarmup } from './_comprobantes/docs-warmup.tsx';
import { IdleWarmup } from './_components/idle-warmup.tsx';

// Every page of the app goes through here: no user, straight to /login. The frame (menu) is a
// persistent layout: it mounts once and navigating only swaps the page.
// Per person, so never prerendered at build time.
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
    const user = await requireUser();
    // The documents start travelling from the <head>, before the page's JavaScript runs.
    preload(DOCS_URL, { as: 'fetch', crossOrigin: 'use-credentials' });
    return (
        <div className="min-h-screen md:flex">
            <Sidebar email={user.email} />
            <main className="min-w-0 flex-1 p-4 md:px-7 md:pt-[22px] md:pb-10">{children}</main>
            <DocsWarmup />
            <IdleWarmup />
        </div>
    );
}
