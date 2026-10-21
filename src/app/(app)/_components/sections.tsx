// The sections of the menu, in order, each with its page in this app.
import type { ReactNode } from 'react';

export interface Section {
    key: string;
    label: string;
    href: string;
    icon: ReactNode;
    /** Shown only to admins (the page checks it again on the server). */
    adminOnly?: boolean;
}

const svg = (children: ReactNode) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[17px] flex-none">
        {children}
    </svg>
);

export const SECTION_GROUPS: { title: string; sections: Section[] }[] = [
    {
        title: 'Comprobantes SUNAT',
        sections: [
            {
                key: 'resumen',
                label: 'Resumen',
                href: '/',
                icon: svg(
                    <>
                        <rect x="3" y="3" width="7" height="9" rx="1.5" />
                        <rect x="14" y="3" width="7" height="5" rx="1.5" />
                        <rect x="14" y="12" width="7" height="9" rx="1.5" />
                        <rect x="3" y="16" width="7" height="5" rx="1.5" />
                    </>,
                ),
            },
            {
                key: 'impuestos',
                label: 'Impuestos',
                href: '/impuestos',
                icon: svg(
                    <>
                        <path d="M19 5 5 19" />
                        <circle cx="6.5" cy="6.5" r="2.5" />
                        <circle cx="17.5" cy="17.5" r="2.5" />
                    </>,
                ),
            },
            {
                key: 'detracciones',
                label: 'Detracciones',
                href: '/detracciones',
                icon: svg(
                    <>
                        <path d="M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18" />
                        <path d="m12 3 9 5H3z" />
                    </>,
                ),
            },
            {
                key: 'factura',
                label: 'Buscar factura',
                href: '/factura',
                icon: svg(
                    <>
                        <path d="M6 2h9l5 5v15H6z" />
                        <path d="M14 2v6h6" />
                        <circle cx="11.5" cy="14.5" r="2.5" />
                        <path d="m13.5 16.5 2 2" />
                    </>,
                ),
            },
            {
                key: 'ruc',
                label: 'Consulta RUC',
                href: '/ruc',
                icon: svg(
                    <>
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-3.5-3.5M8.5 11h5M11 8.5v5" />
                    </>,
                ),
            },
            {
                key: 'precios',
                label: 'Precios',
                href: '/precios',
                icon: svg(
                    <>
                        <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
                        <circle cx="7.5" cy="7.5" r="1.5" />
                    </>,
                ),
            },
            {
                key: 'proveedores',
                label: 'Proveedores',
                href: '/proveedores',
                icon: svg(<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />),
            },
            {
                key: 'oc',
                label: 'OC y centros de costo',
                href: '/oc',
                icon: svg(<path d="M3 7h18v13H3zM8 7V4h8v3M3 12h18" />),
            },
        ],
    },
    {
        title: 'Compras y legajo',
        sections: [
            {
                key: 'legajo',
                label: 'Legajo por OC',
                href: '/legajo',
                icon: svg(
                    <>
                        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <path d="m9 14 2 2 4-4" />
                    </>,
                ),
            },
            {
                key: 'sinoc',
                label: 'Facturas sin OC',
                href: '/sin-oc',
                icon: svg(
                    <>
                        <path d="M6 2h9l5 5v15H6z" />
                        <path d="M14 2v6h6M12 12v3M12 18h.01" />
                    </>,
                ),
            },
            {
                key: 'cambios',
                label: 'Cambios del robot',
                href: '/cambios',
                icon: svg(
                    <>
                        <path d="M21 12a9 9 0 1 1-3-6.7" />
                        <path d="M21 3v6h-6" />
                    </>,
                ),
            },
        ],
    },
    {
        title: 'Administración',
        sections: [
            {
                key: 'usuarios',
                label: 'Usuarios',
                href: '/usuarios',
                adminOnly: true,
                icon: svg(
                    <>
                        <circle cx="9" cy="8" r="3.5" />
                        <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.5a6.5 6.5 0 0 1 3 5.5" />
                    </>,
                ),
            },
        ],
    },
];
