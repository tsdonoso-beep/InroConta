'use client';

// The side menu: the sections (who is in goes in the page's top right corner, UserMenu). It folds
// to icons (the label stays in the title) and remembers it in this browser. On a phone it goes on
// top, as tabs.
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { filterQuery, useFilterState } from '../_comprobantes/filter-store.ts';
import { useMenuBadges, type BadgeTone, type MenuBadges } from './menu-badges.ts';
import { SECTION_GROUPS, type Section } from './sections.tsx';

const STORAGE_KEY = 'inroconta.menu.collapsed';

const TONE: Record<BadgeTone, string> = { danger: 'bg-danger text-on-fill', muted: 'bg-surface-3 text-ink-2', info: 'bg-primary text-on-fill' };

function Badge({ b, collapsed }: { b: MenuBadges[string]; collapsed: boolean }) {
    if (!b?.count) return null;
    const place = collapsed ? 'md:absolute md:top-0.5 md:right-0.5 md:px-[5px] md:text-[9.5px]' : '';
    return (
        <span title={b.title} className={`ml-auto rounded-full px-[7px] py-px text-[11px] font-bold tabular-nums ${TONE[b.tone]} ${place}`}>
            {b.count.toLocaleString('en-US')}
        </span>
    );
}

function Item({ s, active, collapsed, query, badge }: { s: Section; active: boolean; collapsed: boolean; query: string; badge: MenuBadges[string] }) {
    const base = 'relative flex items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-[13.5px] font-semibold whitespace-nowrap';
    const tone = active ? 'bg-primary-soft text-primary-strong' : 'text-ink-2 hover:bg-surface-2 hover:text-ink';
    const shape = collapsed ? 'md:justify-center md:px-0' : '';
    const label = <span className={collapsed ? 'md:hidden' : ''}>{s.label}</span>;
    return (
        <Link href={query ? `${s.href}?${query}` : s.href} title={s.label} className={`${base} ${tone} ${shape}`}>
            {s.icon}
            {label}
            <Badge b={badge} collapsed={collapsed} />
        </Link>
    );
}

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
    const pathname = usePathname();
    // The SUNAT filters travel from one section to the next (the store gives the defaults on
    // the server and in the first render, so the links match what the server drew).
    const query = filterQuery(useFilterState());
    const badges = useMenuBadges();
    const groups = SECTION_GROUPS.map((g) => ({ ...g, sections: g.sections.filter((s) => isAdmin || !s.adminOnly) })).filter((g) => g.sections.length);
    const [collapsed, setCollapsed] = useState(false);
    useEffect(() => {
        try {
            setCollapsed(localStorage.getItem(STORAGE_KEY) === '1');
        } catch {
            /* no storage: open */
        }
    }, []);
    const toggle = () => {
        setCollapsed((c) => {
            try {
                localStorage.setItem(STORAGE_KEY, c ? '' : '1');
            } catch {
                /* no storage: not remembered */
            }
            return !c;
        });
    };

    return (
        <aside
            className={`flex flex-col gap-3 overflow-hidden border-b border-line bg-surface px-4 py-3.5 transition-[width] duration-200 md:sticky md:top-0 md:h-screen md:gap-[18px] md:overflow-y-auto md:border-r md:border-b-0 md:pt-[22px] md:pb-[18px] ${collapsed ? 'md:w-[68px] md:px-2.5' : 'md:w-[252px]'}`}
        >
            <div className={`flex items-center gap-2.5 ${collapsed ? 'md:flex-col md:gap-3.5' : ''}`}>
                <Image src="/images/IconRoland.png" alt="Roland Print" width={36} height={36} className="flex-none" priority />
                <div className={`min-w-0 ${collapsed ? 'md:hidden' : ''}`}>
                    <div className="text-[15px] font-bold">
                        INRO<span className="text-primary-strong">CONTA</span>
                    </div>
                    <div className="text-xs text-ink-3">Contabilidad · SUNAT, compras y legajo</div>
                </div>
                <button
                    type="button"
                    onClick={toggle}
                    title={collapsed ? 'Expandir el menú' : 'Colapsar el menú'}
                    aria-label={collapsed ? 'Expandir el menú' : 'Colapsar el menú'}
                    className={`hidden size-7 flex-none items-center justify-center rounded-lg border border-line text-ink-3 hover:bg-surface-2 hover:text-ink md:flex ${collapsed ? '' : 'ml-auto'}`}
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className={`size-[15px] transition-transform ${collapsed ? 'rotate-180' : ''}`}
                    >
                        <path d="m15 18-6-6 6-6" />
                    </svg>
                </button>
            </div>

            {groups.map((g, i) => (
                <nav key={g.title} className={`flex flex-col gap-2 ${collapsed && i > 0 ? 'md:border-t md:border-line md:pt-3.5' : ''}`}>
                    <div className={`text-[11px] font-bold tracking-[.07em] text-ink-3 uppercase ${collapsed ? 'md:hidden' : ''}`}>{g.title}</div>
                    <div className="flex gap-0.5 overflow-x-auto md:flex-col">
                        {g.sections.map((s) => (
                            <Item key={s.key} s={s} active={pathname === s.href} collapsed={collapsed} query={query} badge={badges[s.key]} />
                        ))}
                    </div>
                </nav>
            ))}
        </aside>
    );
}
