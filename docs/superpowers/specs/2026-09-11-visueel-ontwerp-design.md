# Visueel ontwerp — Opstelling Coach

Design system voor een donker-thema stijl-laag over de bestaande, functioneel
complete app. Geen datamodel- of routewijzigingen — puur `App.css`/
`index.css` plus de JSX-structuur die nodig is om kaart-stijlen en iconen te
tonen.

## Aanleiding

De app werkt (login, spelerslijst, wedstrijden, opstelling, aanwezigheid,
beoordeling, statistieken-dashboard) maar heeft vrijwel geen visuele stijl:
kale formulieren, geen iconen, geen kleursysteem buiten een blote groene
accent. De coach kreeg 12 mockups te zien (extern gegenereerd) van een
bredere "Football Coach"-app-visie en vond de visuele taal daarvan mooi.
Deze spec vertaalt die visuele taal naar de bestaande schermen en scope van
Opstelling Coach — niet naar de grotere, nog niet gebouwde features die de
mockups ook toonden (multi-team, training, staff, live wedstrijdklok). Dat
laatste is een aparte, latere planningsvraag.

Gevalideerd via de brainstorming-skill's visuele companion: lettertype,
kleurenpalet en veld-contrast zijn met echte gerenderde varianten gekozen,
niet blind beschreven.

## Thema-modus

**Donker-altijd, voor nu.** Geen `prefers-color-scheme`-omschakeling meer —
de bestaande light/dark-tokens in `index.css` worden vervangen door één
vaste donkere set. De structuur (CSS custom properties) blijft hetzelfde,
zodat een licht thema later toevoegen een kwestie is van een nieuwe
tokenset, niet een herbouw. Laat een korte comment achter op de plek waar
`@media (prefers-color-scheme: dark)` stond, die dit expliciet noemt.

## Kleurtokens

Vervang de tokens in `src/index.css`:

| Token | Waarde | Gebruik |
|---|---|---|
| `--color-bg` | `#0d1310` | Pagina-achtergrond |
| `--color-surface` | `#161d19` | Kaarten, form-secties |
| `--color-border` | `#223028` | Randen op kaarten/inputs |
| `--color-text` | `#f0f4f2` | Primaire tekst |
| `--color-text-muted` | `#9db3a8` | Secundaire tekst (datums, labels) |
| `--color-accent` | `#22c55e` | Primaire knoppen, actieve tab/link |
| `--color-accent-contrast` | `#06280f` | Tekst op accent-achtergrond |
| `--color-error-bg` / `--color-error-text` | ongewijzigd | Al goed, niet aanraken |

`--color-surface` is nieuw (er was tot nu toe geen apart kaart-token, alleen
`--color-bg`) — nodig omdat kaarten een net iets lichtere achtergrond dan de
pagina moeten hebben om zich af te tekenen.

Veld-specifieke kleuren (niet als globale token, want alleen relevant in
`OpstellingScreen`):
- Veld-achtergrond: `repeating-linear-gradient(180deg, #2f8f4e 0 34px, #288048 34px 68px)` (maaistrepen-effect)
- Shirt veldspeler: rood-zwart verticaal gestreept (bestaande spec-afspraak, nog niet gebouwd)
- Shirt keeper: fel geel (`#fde047`) (bestaande spec-afspraak, nog niet gebouwd)
- Naam-label op het veld: donkere tekst (`#0a2412`) direct op het grasgroen — geen extra kaartje nodig, contrast is voldoende met dit groen

## Typografie

Google Font **Manrope**, gewichten 500/600/700/800, via
`fonts.googleapis.com` (toegestane CDN). `font-display: swap` zodat de
systeemfont-fallback (huidige stack) direct zichtbaar is en geen
layout-shift optreedt zodra Manrope laadt.

- Koppen (`h1`-`h3`): gewicht 700-800
- Body/labels: gewicht 500-600
- Kleine labels (datums, tab-tekst): gewicht 700, iets kleiner formaat, subtiel gedimd via `--color-text-muted`

## Iconen

Nieuwe dependency: `lucide-react`. Toepassen op:
- Tabbalk (`TabBar.tsx`): Spelers/Wedstrijden/Dashboard elk een passend icoon naast het label
- Sub-tabbalk in `MatchDetailScreen.tsx` (Opstelling/Aanwezigheid/Gegevens)
- Koppen waar een icoon de scanbaarheid verbetert (bv. een wedstrijd-icoon naast "Wedstrijden", een mensen-icoon naast "Spelers")

Niet: icoon-per-speler-rij of overdreven decoratieve iconen — terughoudend
toepassen, dit is een functionele coaching-tool, geen consumenten-app.

## Componenten

**Kaart-stijl** (vervangt kale `<li>`/`<ul>` in spelerslijst en
wedstrijdenlijst): `border-radius: 12px`, `background: var(--color-surface)`,
`border: 1px solid var(--color-border)`, padding ~12-16px.

**Tabbalk / sub-tabbalk**: donkere achtergrond, actieve tab in accent-kleur,
inactieve tabs in `--color-text-muted`. Bestaande `env(safe-area-inset-bottom)`-
padding (jt-dvh.14.14) blijft ongewijzigd.

**Knoppen**: primaire actie = accent-achtergrond + `--color-accent-contrast`-
tekst, `border-radius: 8px`, gewicht 700. Secundaire/tekst-links behouden de
huidige, eenvoudigere stijl.

**Formulieren**: invoervelden met `--color-surface`-achtergrond en
`--color-border`-rand, labels in gewicht 600. Bestaande
autoComplete/name/focus-on-error-gedrag (jt-dvh.14.16) blijft ongewijzigd —
dit is puur de visuele laag eroverheen.

**Opstelling-veld**: grasgroen-met-maaistrepen achtergrond (zie
kleurtokens), shirt-vormige iconen per positie (rood-zwart voor veldspelers,
geel voor keeper) i.p.v. de huidige kale knoppen, naam direct op het gras.
Bestaande sleep/tik-logica (jt-dvh.14.15) blijft functioneel ongewijzigd —
dit is puur de visuele laag.

## Wat dit niet is

- Geen nieuwe features, geen datamodel- of routewijziging
- Geen licht thema (bewust uitgesteld, zie Thema-modus)
- Geen multi-team/training/staff/live-wedstrijdklok — dat blijft een aparte,
  latere scope-vraag (zie de gap-analyse eerder deze sessie)
- Geen wijziging aan bestaand getest gedrag (sleep/tik, optimistic UI,
  formulier-validatie) — alleen de visuele laag eroverheen
