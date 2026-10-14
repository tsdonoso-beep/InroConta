import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';

const manrope = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-manrope' });

export const metadata: Metadata = {
    title: 'INROCONTA · Contabilidad INROPRIN',
    description: 'Comprobantes SUNAT, detracciones, compras y legajo de INROPRIN.',
    icons: { icon: '/images/IconRoland.png' },
    robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="es" className={manrope.variable}>
            <body>{children}</body>
        </html>
    );
}
