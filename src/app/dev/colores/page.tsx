import { notFound } from 'next/navigation';
import { ColorSheet } from './sheet.tsx';

// Dev only: /dev/colores with `pnpm dev` shows at a glance every colour, size, radius and shared
// component the app paints, by role (the same page as GRAMA's). Out of the prerender, or the
// production gate below would close during `pnpm build`. Outside (app): no login needed.
export const dynamic = 'force-dynamic';

export default function ColorsPage() {
    if (process.env.NODE_ENV === 'production') notFound();
    return <ColorSheet />;
}
