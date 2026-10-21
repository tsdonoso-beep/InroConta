// The one button of the app, as classes so a <button>, an <a> and a next/link wear the same
// thing. Two axes: the variant (its role) and the size. Five states, the same rule for every
// variant (GRAMA's, /dev/colores shows them side by side):
//   1. normal   — the colour as is;
//   2. hover    — one step darker (-hover token, color-mix 92 %), the background, never the border;
//   3. pressed  — the darkest (-active, 84 %): without it, on a slow line nobody knows the click
//                 landed and they click again;
//   4. focus    — the background is NOT touched: a ring outside, only from the keyboard
//                 (focus-visible), so a mouse click does not leave a ring that reads as an error;
//   5. disabled — the grey pair of tokens, never an opacity: an opacity over a colour gives the
//                 same colour washed out, and the button still looks clickable.
// The hand cursor is in the base (globals.css gives it to every button).
import type { ButtonHTMLAttributes } from 'react';

const VARIANT = {
    /** The main action of the screen: one per screen. */
    primary: 'bg-primary text-on-fill hover:bg-primary-hover active:bg-primary-active',
    /** The reasonable alternative: cancel, go back, an action next to the main one. */
    secondary: 'border border-control bg-surface text-ink hover:bg-surface-2 active:bg-surface-3 disabled:border-disabled',
    /** Row and bar actions: only a background under the pointer. */
    ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink active:bg-surface-3 disabled:bg-transparent',
    /** A strong call to action on a coloured notice, where blue would compete with the notice. */
    dark: 'bg-ink text-on-fill hover:bg-ink-hover active:bg-ink-active',
    /** Something that deletes or cannot be undone. */
    danger: 'bg-danger text-on-fill hover:bg-danger-hover active:bg-danger-active',
} as const;

const SIZE = {
    md: 'rounded-[9px] px-3.5 py-2 text-[13px]',
    lg: 'rounded-[10px] px-[18px] py-[11px] text-[13.5px]',
} as const;

export type ButtonVariant = keyof typeof VARIANT;
export type ButtonSize = keyof typeof SIZE;
export const BUTTON_VARIANTS = Object.keys(VARIANT) as ButtonVariant[];
export const BUTTON_SIZES = Object.keys(SIZE) as ButtonSize[];

const BASE =
    'inline-flex cursor-pointer items-center justify-center gap-2 font-semibold whitespace-nowrap no-underline transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-ink';

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
export const LINK_CLASS = 'cursor-pointer text-primary hover:underline active:text-primary-active focus-visible:outline-2 focus-visible:outline-primary';
