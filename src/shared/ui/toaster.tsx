'use client';

// The app's confirmations (sonner), mounted once in the root layout and dressed as the app's CARD:
// white, thin grey border, 12 px. The outcome is told by the icon's colour alone (he chose it on
// 21/10/2026: no coloured edge). Call `toast.success(...)` / `toast.error(...)` from any client
// component; /dev/colores shows them live.
import { Toaster as Sonner } from 'sonner';

export { toast } from 'sonner';

export function Toaster() {
    return (
        <Sonner
            position="bottom-right"
            closeButton
            toastOptions={{
                duration: 4000,
                classNames: {
                    // A floating card needs a shadow to stand off the page; the in-page CARD has none.
                    toast: '!rounded-[12px] !border !border-control !bg-surface !font-sans !text-ink !shadow-card',
                    title: '!text-[13.5px] !font-semibold',
                    description: '!text-[12.5px] !text-ink-2',
                    success: '[&_[data-icon]]:!text-success',
                    error: '[&_[data-icon]]:!text-danger',
                    info: '[&_[data-icon]]:!text-primary',
                    actionButton: '!cursor-pointer !rounded-lg !bg-ink !font-semibold !text-on-fill hover:!bg-ink/85',
                    closeButton: '!cursor-pointer !border-control !bg-surface !text-ink-3 hover:!text-ink',
                },
            }}
        />
    );
}
