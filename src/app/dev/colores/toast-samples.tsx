'use client';

// The toasts of the app for real (shared/ui/toaster.tsx): each button throws one, as the screens do.
import { Button } from '../../../shared/ui/button.tsx';
import { CARD } from '../../../shared/ui/card.tsx';
import { toast } from '../../../shared/ui/toaster.tsx';
import { Section } from './section.tsx';

export function ToastSamples() {
    return (
        <Section
            title="Avisos flotantes (toasts)"
            blurb="La confirmación de lo que se acaba de hacer: abajo a la derecha, 4 segundos. El color va solo en el icono, sin barra al lado."
        >
            <div className={`flex flex-wrap gap-2.5 ${CARD} p-4`}>
                <Button onClick={() => toast.success('nombre@inroprin.com ya puede entrar como admin.')}>Éxito</Button>
                <Button
                    variant="secondary"
                    onClick={() =>
                        toast.success('nombre@inroprin.com ya no puede entrar (en un minuto como máximo).', {
                            action: { label: 'Deshacer', onClick: () => toast.success('nombre@inroprin.com puede entrar otra vez.') },
                        })
                    }
                >
                    Éxito con «Deshacer»
                </Button>
                <Button variant="danger" onClick={() => toast.error('Solo cuentas @inroprin.com.')}>
                    Error
                </Button>
                <Button variant="secondary" onClick={() => toast.info('Los datos se actualizaron a las 07:00.')}>
                    Información
                </Button>
                <Button variant="ghost" onClick={() => toast.success('Guardado.', { description: 'El cambio ya se ve en todas las pantallas.' })}>
                    Con descripción
                </Button>
            </div>
        </Section>
    );
}
