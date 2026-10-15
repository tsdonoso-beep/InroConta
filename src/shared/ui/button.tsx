// The one button of the app, as classes so a <button>, an <a> and a next/link wear the same
// thing. Two axes: the variant (its role) and the size. Hover is a step darker, focus is a ring
// outside that only the keyboard brings (focus-visible), and disabled is the grey pair of
// tokens, never an opacity: an opacity over a colour gives the same colour washed out.
import type { ButtonHTMLAttributes } from 'react';

const VARIANT = {
    /** The main action of the screen: one per screen. */
    primary: 'bg-primary text-on-fill hover:bg-primary-strong',
    /** A strong call to action on a coloured notice, where blue would compete with the notice. */
    dark: 'bg-ink text-on-fill hover:bg-ink/85',
} as const;

const SIZE = {
    md: 'rounded-[9px] px-3.5 py-2 text-[13px]',
    lg: 'rounded-[10px] px-[18px] py-[11px] text-[13.5px] shadow-card',
} as const;

export type ButtonVariant = keyof typeof VARIANT;
export type ButtonSize = keyof typeof SIZE;
export const BUTTON_VARIANTS = Object.keys(VARIANT) as ButtonVariant[];
export const BUTTON_SIZES = Object.keys(SIZE) as ButtonSize[];

const BASE =
    'inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-ink disabled:shadow-none';

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className = '') {
    return `${BASE} ${VARIANT[variant]} ${SIZE[size]} ${className}`;
}

export function Button({
    variant,
    size,
    className,
    type = 'button',
    ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
    return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}

/** A link inside text or a table: the brand blue, underlined under the pointer. */
export const LINK_CLASS = 'text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary';
