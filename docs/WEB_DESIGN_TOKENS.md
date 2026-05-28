# Web Design Tokens (Patch 01 Foundation)

## Scope

Dieses Dokument beschreibt die im `web/` App-Shell genutzten Foundation-Tokens aus Phase 1. Fokus ist Darstellung: Farbe, Spacing, Radius, Shadow, Typografie und Status-Semantik.

## Token Groups

### Semantic colors

- `--color-neutral`, `--color-neutral-strong`
- `--color-ok`, `--color-ok-strong`
- `--color-info`, `--color-info-strong`
- `--color-warning`, `--color-warning-strong`
- `--color-danger`, `--color-danger-strong`

### Surfaces and text

- `--color-bg-canvas`, `--color-bg-surface`, `--color-bg-surface-muted`, `--color-bg-input`
- `--color-text-primary`
- `--color-border-default`

### Spacing / shape / elevation

- Spacing: `--token-space-2`, `--token-space-3`, `--token-space-4`, `--token-space-6`
- Radius: `--token-radius-sm`, `--token-radius-md`, `--token-radius-full`
- Shadow: `--token-shadow-panel`

### Badge tokens

- Neutral: `--token-badge-neutral-bg`, `--token-badge-neutral-border`
- OK: `--token-badge-ok-bg`, `--token-badge-ok-border`
- Info: `--token-badge-info-bg`, `--token-badge-info-border`
- Warning: `--token-badge-warning-bg`, `--token-badge-warning-border`
- Danger: `--token-badge-danger-bg`, `--token-badge-danger-border`

## App aliases

Für bestehende Styles werden Legacy-Aliases genutzt und auf Tokens gemappt:

- `--bg`, `--surface`, `--surface-2`
- `--text`, `--muted`, `--border`
- `--accent`, `--accent-strong`
- `--warning`, `--danger`
- `--shadow`

## Status communication contract

Status-Indikatoren nutzen immer:

1. Farbe (`is-ok|is-info|is-warning|is-danger`)
2. Icon (`.badge-icon`)
3. Text (`.badge-label`)

Damit bleibt die UI ohne reine Farbabhängigkeit verständlich.

## Metric card tones

Dashboard-Karten nutzen semantische Border-Tones:

- `.status-card--tone-neutral`
- `.status-card--tone-ok`
- `.status-card--tone-info`
- `.status-card--tone-warning`
- `.status-card--tone-danger`

## Responsive phase-1 breakpoints

- Mobile: `< 480px`
- Tablet: `480px bis 1023px`
- Desktop: `>= 1024px`

Implementiert in `web/styles.css` über:

- `@media (max-width: 1023px)`
- `@media (max-width: 479px)`
