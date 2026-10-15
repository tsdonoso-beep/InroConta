// What /dev/colores shows: every token of globals.css with its role and where it is used. The
// swatch reads the variable from the page, so the value shown IS the token; this file only
// holds the names and the reasons. A token that is added to globals.css goes here too.

export interface Swatch {
    token: string;
    role: string;
    where?: string;
}

export interface Group {
    title: string;
    blurb: string;
    swatches: Swatch[];
}

export const GROUPS: Group[] = [
    {
        title: 'Marca Roland Print',
        blurb: 'Los cinco colores del logo más el azul oscuro y el gris claro de su web. Son VALORES, no roles: ningún componente los pinta directo; los roles de abajo apuntan aquí. Cambiar la marca es cambiar esta fila.',
        swatches: [
            { token: '--color-brand-blue', role: 'Azul del logo', where: '→ primary' },
            { token: '--color-brand-blue-dark', role: 'Azul oscuro de la web', where: '→ primary-strong' },
            { token: '--color-brand-red', role: 'Rojo del logo', where: '→ danger' },
            { token: '--color-brand-teal', role: 'Turquesa del logo', where: '→ teal, success' },
            { token: '--color-brand-yellow', role: 'Amarillo del logo', where: '→ warning' },
            { token: '--color-brand-ink', role: 'Negro del logo', where: '→ ink' },
            { token: '--color-brand-light', role: 'Gris claro de la web', where: '→ canvas' },
        ],
    },
    {
        title: 'Superficies ✅',
        blurb: 'De fondo a frente: el lienzo gris, la tarjeta blanca y dos grises cálidos para lo que va DENTRO de una tarjeta (fila al pasar, pista de una barra, chip apagado).',
        swatches: [
            { token: '--color-canvas', role: 'Fondo de la app, detrás de las tarjetas', where: 'body' },
            { token: '--color-surface', role: 'Tarjeta, control, menú', where: 'bg-surface' },
            { token: '--color-surface-2', role: 'Fila bajo el cursor, fila abierta, pastilla', where: 'hover:bg-surface-2' },
            { token: '--color-surface-3', role: 'Pista de barra y anillo, chip apagado', where: 'bg-surface-3' },
        ],
    },
    {
        title: 'Líneas ✅',
        blurb: 'Dos pesos. El divisor de dentro de una tarjeta no pesa lo mismo que el borde de algo que se toca.',
        swatches: [
            { token: '--color-line', role: 'Divisor de filas, borde de tarjeta', where: 'border-line' },
            { token: '--color-control', role: 'Borde de control: buscador, select, segmentado; cabecera de tabla', where: 'border-control' },
        ],
    },
    {
        title: 'Tinta ✅',
        blurb: 'Tres pesos de texto, sin alfa: un gris sólido se lee igual sobre blanco y sobre surface-2, un text-ink/60 no. on-fill es el texto sobre un relleno de color (botón, insignia, celda oscura del mapa de calor) y sustituye al text-white suelto.',
        swatches: [
            { token: '--color-ink', role: 'Texto principal, títulos, cifras', where: 'text-ink (body)' },
            { token: '--color-ink-2', role: 'Secundario: cifras de apoyo, notas de KPI', where: 'text-ink-2' },
            { token: '--color-ink-3', role: 'Tenue: cabeceras de tabla, etiquetas, metadatos', where: 'text-ink-3' },
            { token: '--color-on-fill', role: 'Texto sobre relleno de color', where: 'text-on-fill' },
        ],
    },
    {
        title: 'Primario ✅',
        blurb: 'El azul de marca en cuatro piezas: el sólido (botón, barra, enlace), el fuerte (su hover y el texto sobre el suave), el suave (fondo de lo elegido, aviso informativo) y su línea.',
        swatches: [
            { token: '--color-primary', role: 'Botón, barra de ventas, enlace, foco', where: 'bg-primary, text-primary' },
            { token: '--color-primary-strong', role: 'Hover del primario; texto sobre primary-soft', where: 'hover:bg-primary-strong' },
            { token: '--color-primary-soft', role: 'Ítem activo del menú, fila elegida, chip info', where: 'bg-primary-soft' },
            { token: '--color-primary-line', role: 'Borde sobre primary-soft; hover de la pastilla de archivo', where: 'border-primary-line' },
        ],
    },
    {
        title: 'Segundo color de datos ✅',
        blurb: 'Turquesa: compras al lado de ventas en azul, y el mapa de calor (color-mix al % del valor). Es el MISMO valor que success, pero no el mismo rol: success dice «está bien», teal dice «la otra serie». Por eso success apunta a teal en vez de repetir el hex.',
        swatches: [
            { token: '--color-teal', role: 'Barra y anillo de compras, mapa de calor', where: 'bg-teal, stroke-teal' },
            { token: '--color-teal-strong', role: 'Texto turquesa legible', where: '→ success-strong' },
            { token: '--color-teal-soft', role: 'Fondo turquesa', where: '→ success-soft' },
        ],
    },
    {
        title: 'Deshabilitado ✅',
        blurb: 'Gris y sin color, nunca con opacidad: una opacidad sobre azul da azul lavado y se lee como otro estado. Botones y controles (buscador, select, período) usan este par.',
        swatches: [
            { token: '--color-disabled', role: 'Relleno del control apagado', where: 'disabled:bg-disabled' },
            { token: '--color-disabled-ink', role: 'Su texto; también el 0 del mapa de calor', where: 'disabled:text-disabled-ink' },
        ],
    },
];

/** The three status roles, each with the same three pieces. */
export const STATUS = [
    {
        role: 'danger',
        use: 'Error, riesgo, SSCO, sin OC, nota de crédito',
        solid: 'bg-danger',
        strong: 'text-danger-strong',
        strongBg: 'bg-danger-strong',
        soft: 'bg-danger-soft',
    },
    {
        role: 'warning',
        use: 'Aviso, pendiente, por revisar',
        solid: 'bg-warning',
        strong: 'text-warning-strong',
        strongBg: 'bg-warning-strong',
        soft: 'bg-warning-soft',
    },
    {
        role: 'success',
        use: 'Correcto, cuadrado, pagado',
        solid: 'bg-success',
        strong: 'text-success-strong',
        strongBg: 'bg-success-strong',
        soft: 'bg-success-soft',
    },
] as const;

/** Alpha over ink: only the gap of a value still travelling. */
export const ALPHA = [
    { className: 'bg-ink/10', role: 'Hueco: el valor que aún viaja (hueco.tsx)' },
    { className: 'bg-ink/85', role: 'Hover del botón oscuro' },
];

/** The type sizes in use, counted on 2026-10-14: the work list, not a scale yet. */
export const TYPE = [
    { className: 'text-[21px] font-extrabold', role: 'Título de sección', uses: 2 },
    { className: 'text-2xl font-extrabold', role: 'Cifra de KPI', uses: 1 },
    { className: 'text-[15px] font-bold', role: 'Título de tarjeta', uses: 4 },
    { className: 'text-[14px]', role: 'Cuerpo (body)', uses: 1 },
    { className: 'text-[13.5px]', role: 'Tabla, control, menú', uses: 12 },
    { className: 'text-[13px]', role: 'Botón, aviso, vacío', uses: 26 },
    { className: 'text-[12.5px] font-semibold', role: 'Chip, segmentado, acción de texto', uses: 15 },
    { className: 'text-xs', role: 'Nota de tarjeta y KPI (12px)', uses: 42 },
    { className: 'text-[11.5px]', role: 'Sub-línea de tabla', uses: 15 },
    { className: 'text-[11px] font-semibold tracking-[.05em] uppercase', role: 'Cabecera de tabla, etiqueta de KPI', uses: 10 },
];

/** The corner radii by role. */
export const RADII = [
    { className: 'rounded-[3px]', role: 'Pie de una barra de gráfico' },
    { className: 'rounded-md', role: 'Pista de barra, hueco' },
    { className: 'rounded-[7px]', role: 'Dentro de un control: segmento, pastilla de archivo, cabeza de barra' },
    { className: 'rounded-lg', role: 'Fila clicable, botón de icono' },
    { className: 'rounded-[9px]', role: 'Control y botón md' },
    { className: 'rounded-[10px]', role: 'Ítem del menú, botón lg, bloque dentro del detalle' },
    { className: 'rounded-xl', role: 'Aviso, bloque destacado (ficha RUC, cabecera)' },
    { className: 'rounded-[14px]', role: 'Tarjeta y KPI' },
    { className: 'rounded-2xl', role: 'La tarjeta del login (la única)' },
    { className: 'rounded-full', role: 'Chip, insignia del menú' },
];
