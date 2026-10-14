'use client';

// The SUNAT card of a supplier (good taxpayer, agents, state, fiscal address, SSCO) that Buscar
// factura and Consulta RUC show on top. The port of fichaProveedor (VistaEjecutivaPagina.html)
// and sscoChip (VistaConsultaRuc.html).
import type { ReactNode } from 'react';
import { isNaturalPerson, isOdd, placeOf, type SscoEntry } from '../../../modules/ruc/application/views.ts';
import { Chip } from '../../../shared/ui/card.tsx';
import { dmy } from '../../../shared/ui/format.ts';
import { Hueco } from '../../../shared/ui/hueco.tsx';
import type { RucIndex } from '../_lib/stores.ts';

/** The red chip of a RUC in the SSCO list (nothing when it is not, or the list is not here). */
export function SscoChip({ entry }: { entry: SscoEntry | null | undefined }) {
    if (!entry) return null;
    return (
        <Chip tone="danger" title={`${entry.resolution} · firme el ${dmy(entry.finalDate)}`}>
            ⚠ Sin capacidad operativa (SSCO)
        </Chip>
    );
}

/** «✓ Buen contribuyente» next to a supplier in a list. */
export const GoodTaxpayerMark = () => (
    <span className="font-bold text-success-strong" title="Buen contribuyente (padrón de SUNAT)">
        ✓ Buen contribuyente
    </span>
);

const Box = ({ children, className = 'mb-3' }: { children: ReactNode; className?: string }) => (
    <div className={`rounded-xl border border-line bg-surface-2 px-3.5 py-3 ${className}`}>{children}</div>
);

function Head({ ruc, name }: { ruc: string; name: string }) {
    return (
        <>
            <div className="text-[15px] font-bold">{name || ruc}</div>
            <div className="mt-0.5 text-[11.5px] text-ink-3">RUC {ruc}</div>
        </>
    );
}

export function TaxpayerCardGap({ className }: { className?: string }) {
    return (
        <Box className={className}>
            <Hueco className="h-4 w-64" />
            <div className="mt-2 flex gap-1.5">
                <Hueco className="h-6 w-40" />
                <Hueco className="h-6 w-32" />
            </div>
            <Hueco className="mt-2 h-3.5 w-80" />
        </Box>
    );
}

/**
 * `missing`: what to say when the RUC has no card. Without it (Buscar factura), and with the
 * lists not here or empty, nothing is claimed about the RUC: the card is not drawn.
 */
export function TaxpayerCardView({ ruc, name, idx, missing, className }: { ruc: string; name: string; idx: RucIndex; missing?: string; className?: string }) {
    if (!idx.ready) return idx.error ? null : <TaxpayerCardGap className={className} />;
    const card = idx.card(ruc);
    if (!card) {
        if (!missing && !idx.lists?.cards.length) return null;
        return (
            <Box className={className}>
                <Head ruc={ruc} name={name || (missing ? `RUC ${ruc}` : '')} />
                <p className="mt-1.5 text-xs text-ink-3">{missing ?? 'Todavía sin ficha de SUNAT para este RUC: el robot la trae en su próxima corrida.'}</p>
            </Box>
        );
    }
    const odd = isOdd(card);
    const place = placeOf(card);
    const status = [card.state, card.condition].filter(Boolean).join(' · ');
    return (
        <Box className={className}>
            <Head ruc={ruc} name={name} />
            <div className="mt-2 mb-1.5 flex flex-wrap gap-1.5">
                {card.goodTaxpayer ? (
                    <Chip tone="ok" title="Está en el padrón de Buenos Contribuyentes de SUNAT">
                        ✓ Buen contribuyente
                    </Chip>
                ) : card.checkedOn ? (
                    <Chip tone="muted">No es buen contribuyente</Chip>
                ) : (
                    <Chip tone="muted" title="La Consulta RUC todavía no lo revisó: el robot lo trae en su próxima corrida">
                        Buen contribuyente: sin consultar
                    </Chip>
                )}
                {card.withholdingAgent && <Chip tone="info">Agente de retención</Chip>}
                {card.perceptionAgent && <Chip tone="info">Agente de percepción</Chip>}
                {status && (
                    <Chip tone={odd ? 'warn' : 'muted'} title={odd ? 'Ojo: no está activo o no está habido' : undefined}>
                        {status}
                    </Chip>
                )}
                <SscoChip entry={idx.ssco(ruc)} />
            </div>
            <div className="text-[13px] leading-[1.45] [overflow-wrap:anywhere] text-ink-2">
                {card.address || place ? (
                    <>
                        <b>Domicilio fiscal:</b> {card.address || '—'}
                        {place && ` · ${place}`}
                    </>
                ) : (
                    <span className="text-ink-3">
                        {isNaturalPerson(ruc) ? 'Persona natural: SUNAT no publica su domicilio.' : 'Domicilio todavía no cargado.'}
                    </span>
                )}
            </div>
            {card.checkedOn && <div className="mt-1 text-xs text-ink-3">Condición consultada en SUNAT el {dmy(card.checkedOn)}</div>}
        </Box>
    );
}

/** The RUC cards and the SSCO list could not be read: said in words, never «not in the list». */
export function RucListsError({ error }: { error: string | null }) {
    if (!error) return null;
    return (
        <p className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-[13px] text-danger-strong">
            No se pudieron leer las fichas de SUNAT y la lista SSCO de la base: {error} El detalle está en el log del servidor.
        </p>
    );
}
