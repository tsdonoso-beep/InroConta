'use client';

// Who is signed in, in the top right corner of every page as usual: their Google photo (or
// initials) and, on click, their name, email and the way out. It used to be a block at the foot of
// the side menu that took its space (his decision, 21/10/2026).
import { useEffect, useRef, useState } from 'react';
import { CARD } from '../../../shared/ui/card.tsx';

const initials = (name: string | null, email: string) =>
    (name ?? email)
        .split(/[\s.@]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join('');

function Avatar({ name, email, image }: { name: string | null; email: string; image: string | null }) {
    const [broken, setBroken] = useState(false);
    if (image && !broken)
        // A Google photo (lh3.googleusercontent.com): a plain <img>, no next/image domain to allow,
        // and no referrer, which Google may refuse.
        return <img src={image} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="size-8 rounded-full object-cover" />;
    return (
        <span className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-[12px] font-bold text-primary-strong">
            {initials(name, email)}
        </span>
    );
}

export function UserMenu({ email, name, image }: { email: string; name: string | null; image: string | null }) {
    const [open, setOpen] = useState(false);
    // Fixed, not absolute: the menu scrolls and clips (overflow), and a folded one is 68 px wide.
    const [at, setAt] = useState({ top: 0, left: 0 });
    const box = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent | KeyboardEvent) => {
            if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', close);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', close);
        };
    }, [open]);

    return (
        <div ref={box} className="relative flex-none">
            <button
                type="button"
                onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setAt({ top: r.bottom + 8, left: Math.max(8, Math.min(r.right - 256, window.innerWidth - 264)) });
                    setOpen((o) => !o);
                }}
                title={name ? `${name} · ${email}` : email}
                aria-label="Tu cuenta"
                aria-expanded={open}
                className="flex rounded-full outline-offset-2 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-primary"
            >
                <Avatar name={name} email={email} image={image} />
            </button>
            {open && (
                <div style={at} className={`fixed z-50 w-64 ${CARD} p-3.5 text-xs`}>
                    {name && <div className="truncate text-[13px] font-bold text-ink">{name}</div>}
                    <div className="truncate text-ink-2" title={email}>
                        {email}
                    </div>
                    {/* Straight out, no «are you sure» step: /api/salir drops the session and goes to /login. */}
                    <form action="/api/salir" method="post">
                        <button
                            type="submit"
                            className="mt-3 w-full rounded-[9px] border border-control px-3 py-2 text-left text-[12.5px] font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink active:bg-surface-3"
                        >
                            Cerrar sesión
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}
