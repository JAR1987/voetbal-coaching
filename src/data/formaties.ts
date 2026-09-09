import type { Formatie } from './types'

/** One pitch slot: `naam` is the exact KNVB name (== `opstelling.positie`),
 * `id` a short stable UI key, `x`/`y` percentage pitch coordinates. */
export interface FormatieSlot {
  id: string
  naam: string
  x: number
  y: number
}

/** Ordered pitch slots per formatie (x/y = pitch %). Only 1-3-3-1's
 * coordinates come from the prototype; the other three are new. */
export const FORMATIE_SLOTS: Record<Formatie, readonly FormatieSlot[]> = {
  '1-3-3-1': [
    { id: 'keeper', naam: 'Keeper', x: 50, y: 90 },
    { id: 'linksback', naam: 'Linksback', x: 18, y: 67 },
    { id: 'centrale-verdediger', naam: 'Centrale verdediger', x: 50, y: 71 },
    { id: 'rechtsback', naam: 'Rechtsback', x: 82, y: 67 },
    { id: 'linksmidden', naam: 'Linksmidden', x: 16, y: 41 },
    { id: 'centrale-middenvelder', naam: 'Centrale middenvelder', x: 50, y: 45 },
    { id: 'rechtsmidden', naam: 'Rechtsmidden', x: 84, y: 41 },
    { id: 'spits', naam: 'Spits', x: 50, y: 15 },
  ],
  '1-2-3-2': [
    { id: 'keeper', naam: 'Keeper', x: 50, y: 90 },
    { id: 'linksback', naam: 'Linksback', x: 30, y: 67 },
    { id: 'rechtsback', naam: 'Rechtsback', x: 70, y: 67 },
    { id: 'linksmidden', naam: 'Linksmidden', x: 18, y: 45 },
    { id: 'centrale-middenvelder', naam: 'Centrale middenvelder', x: 50, y: 45 },
    { id: 'rechtsmidden', naam: 'Rechtsmidden', x: 82, y: 45 },
    { id: 'linksspits', naam: 'Linksspits', x: 30, y: 15 },
    { id: 'rechtsspits', naam: 'Rechtsspits', x: 70, y: 15 },
  ],
  '1-4-3-3': [
    { id: 'keeper', naam: 'Keeper', x: 50, y: 92 },
    { id: 'linksback', naam: 'Linksback', x: 12, y: 72 },
    { id: 'linker-centrale-verdediger', naam: 'Linker centrale verdediger', x: 38, y: 76 },
    { id: 'rechter-centrale-verdediger', naam: 'Rechter centrale verdediger', x: 62, y: 76 },
    { id: 'rechtsback', naam: 'Rechtsback', x: 88, y: 72 },
    { id: 'controlerende-middenvelder', naam: 'Controlerende middenvelder', x: 50, y: 54 },
    { id: 'linker-centrale-middenvelder', naam: 'Linker centrale middenvelder', x: 25, y: 42 },
    { id: 'rechter-centrale-middenvelder', naam: 'Rechter centrale middenvelder', x: 75, y: 42 },
    { id: 'linksbuiten', naam: 'Linksbuiten', x: 15, y: 15 },
    { id: 'spits', naam: 'Spits', x: 50, y: 12 },
    { id: 'rechtsbuiten', naam: 'Rechtsbuiten', x: 85, y: 15 },
  ],
  '1-4-4-2': [
    { id: 'keeper', naam: 'Keeper', x: 50, y: 92 },
    { id: 'linksback', naam: 'Linksback', x: 12, y: 72 },
    { id: 'linker-centrale-verdediger', naam: 'Linker centrale verdediger', x: 38, y: 76 },
    { id: 'rechter-centrale-verdediger', naam: 'Rechter centrale verdediger', x: 62, y: 76 },
    { id: 'rechtsback', naam: 'Rechtsback', x: 88, y: 72 },
    { id: 'linksmidden', naam: 'Linksmidden', x: 10, y: 45 },
    { id: 'linker-centrale-middenvelder', naam: 'Linker centrale middenvelder', x: 37, y: 45 },
    { id: 'rechter-centrale-middenvelder', naam: 'Rechter centrale middenvelder', x: 63, y: 45 },
    { id: 'rechtsmidden', naam: 'Rechtsmidden', x: 90, y: 45 },
    { id: 'spits-links', naam: 'Spits (links)', x: 35, y: 15 },
    { id: 'spits-rechts', naam: 'Spits (rechts)', x: 65, y: 15 },
  ],
}
