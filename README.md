# Warenwirtschaft Gastronovi Workflow

## Projektüberblick

Diese App ist eine Warenwirtschafts-Webapp für Gastronomie-Betriebe. Sie unterstützt Restaurantleitung, Schichtleitung und Mitarbeitende dabei, Artikel, Lagerbestand und Warenbewegungen nachvollziehbar zu erfassen.

Der aktuelle Schwerpunkt liegt auf:

- Artikel und Stammdaten
- Bestand und kritische Bestände
- Bestellungen
- Wareneingang
- Entnahmen
- Korrekturen mit Prüfung
- Audit-/Bewegungsverlauf

Das Repository enthält außerdem die technische Grundlage für einen späteren Gastronovi-nahen Workflow-Adapter. Externe POS-Daten werden nicht direkt als operative Wahrheit behandelt, sondern sollen erst gespeichert, normalisiert, versioniert und dann als interne Workflow-Ereignisse verarbeitet werden.

## Aktueller MVP-Funktionsumfang

Status-Legende:

- **Vorhanden**: im Code umgesetzt und durch Tests oder lokale Dateien belegbar.
- **Teilweise vorhanden**: UI oder Backend ist vorhanden, aber noch nicht vollständig produktionsreif.
- **Geplant**: in Doku, Roadmap oder UI-Hinweisen sichtbar, aber noch nicht vollständig umgesetzt.

| Bereich | Status | Aktueller Stand |
| --- | --- | --- |
| Übersicht / Dashboard | **Vorhanden** | Statische Webapp mit Statuskarten, Arbeitsbereichen und Schnellzugriffen für `admin` und `shift_lead`. Einige Kennzahlen sind Fixture-/UI-Zustände. |
| Artikel | **Vorhanden** | Admin kann Artikel anlegen, listen, bearbeiten und deaktivieren. Artikeländerungen verändern keinen Bestand direkt. |
| Bestand | **Vorhanden** | Bestand wird aus Bewegungen/Snapshots gelesen. Kritische Bestände werden als `low` oder `negative` angezeigt. |
| Bestellungen | **Vorhanden** | Admin und Shift-Lead können Bestellungen anlegen, lesen, als bestellt markieren und stornieren. Bestellungen verändern den Bestand nicht direkt. |
| Wareneingang | **Vorhanden** | Admin und Shift-Lead können Wareneingänge buchen. Wareneingang erhöht den Bestand und kann mit Bestellungen verknüpft werden. |
| Entnahmen | **Vorhanden** | Admin, Shift-Lead und Staff können backendseitig Entnahmen buchen. Die aktuelle Web-Navigation gibt Staff dafür vor allem den Schnellbuchen-Weg. |
| Korrekturen | **Vorhanden** | Korrekturen starten als Antrag und ändern Bestand erst nach Admin-Freigabe. |
| Prüfung / Review | **Vorhanden** | Admin kann Prüfaufgaben starten, lösen, verwerfen sowie Korrekturen genehmigen oder ablehnen. Shift-Lead hat aktuell keine Review-Freigabe. |
| Rollenbasierte Bedienung | **Teilweise vorhanden** | UI und API kennen `admin`, `shift_lead`, `staff` und `system`. Zugriff wird aktuell über Actor-Header gesteuert, nicht über produktionsreifes Login. |
| Login / Registrierung | **Geplant** | Es gibt noch kein echtes Login und keine Registrierung. Der aktuelle Kontext nutzt `x-actor-id` und `x-actor-role`. |
| Profil / Settings | **Geplant** | Noch keine fertigen Profil- oder Einstellungsseiten. Der Dev-/Demo-Kontext wird über `/app-context` bereitgestellt. |
| Eigener Verlauf / Hinweise für Staff | **Teilweise vorhanden** | UI-Flächen sind vorhanden, aber als read-only bzw. noch nicht vollständig an das Audit-Read-Model angebunden. |
| CSV Import / Export / Reset | **Vorhanden** | Admin kann Inventardaten exportieren, importieren und zurücksetzen. |
| Gastronovi-Anbindung | **Teilweise vorhanden** | Raw-Payload-Speicherung, Hashing und Sync-Run-Boundaries existieren. Live-Zugriff, Normalisierung und produktive Connectoren sind späterer Umfang. |

## Rollenmodell

| Rolle | Zweck | Typische Aufgaben |
| --- | --- | --- |
| Chef / Admin | Gesamtverantwortung | Artikel verwalten, Stammdaten pflegen, kritische Bestände prüfen, Korrekturen freigeben oder ablehnen, CSV-Daten verwalten, Review-Aufgaben bearbeiten |
| Shift-Lead | Operative Schichtleitung | Bestand und Audit prüfen, Bestellungen anlegen, Wareneingänge buchen, Entnahmen kontrollieren, Korrekturen erfassen |
| Staff | Tagesgeschäft | Schnelle Entnahmen erfassen, Fehler/Korrekturen melden, eigene operative Hinweise nutzen; vollständige Admin- und Review-Bereiche sind nicht freigegeben |

## Technischer Schnellstart

### Voraussetzungen

- Node.js mit npm
- Supabase Postgres als kanonische Datenbank
- `.env` auf Basis von `.env.example`
- Für produktive Umgebungen: Redis oder Upstash Redis REST-Konfiguration

### Installation

```bash
npm install
```

### Environment

Kopiere `.env.example` nach `.env` und ersetze Platzhalter durch Werte aus dem Supabase Dashboard. Keine echten Zugangsdaten in Git committen.

Wichtige Variablen:

```env
DATABASE_URL=...
DIRECT_URL=...
REDIS_URL=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
GASTRONOVI_API_BASE_URL=...
GASTRONOVI_API_KEY=...
GASTRONOVI_TENANT_ID=...
```

`DATABASE_URL` wird für App/Runtime genutzt. `DIRECT_URL` wird für Prisma-CLI- und Migrationsabläufe genutzt, wenn eine direkte Datenbankverbindung erforderlich ist.

### Lokaler Start

```bash
npm run dev
```

Der API-Server läuft standardmäßig auf dem konfigurierten `PORT`. Die Webapp liegt als statische Oberfläche in `web/index.html` und nutzt standardmäßig `http://localhost:4000`, wenn sie lokal aus einer Datei oder von einem anderen lokalen Port geöffnet wird.

### Tests und Checks

```bash
npm run typecheck
npm test -- --run
npm run build
npm run prisma:validate
```

### Smoke-Test

```bash
npm run smoke:inventory-api
```

Der Smoke-Test benötigt eine gültige Supabase-basierte `DATABASE_URL`. Er schreibt scoped `codex-smoke-*` Inventardaten in die konfigurierte Datenbank und löscht sie vor Ende wieder.

### Deployment-Hinweise für Vercel

`vercel.json` liefert die Fastify-API über `api/index.ts` und die statische Webapp aus `web/` aus. Vor einem Deployment müssen produktive Environment-Variablen in Vercel gesetzt sein. Produktive Redis-Konfiguration ist über `REDIS_URL` oder über `UPSTASH_REDIS_REST_URL` plus `UPSTASH_REDIS_REST_TOKEN` erforderlich.

## Projektstruktur

| Pfad | Zweck |
| --- | --- |
| `web/` | Statische Webapp mit HTML, CSS, JavaScript und Favicon-/Manifest-Dateien. |
| `src/` | Fastify-App, Routen, Konfiguration und Domain-Services. |
| `api/` | Vercel-Entry-Point für die Fastify-App. |
| `tests/` | Vitest-Tests für Services, Routen, Web-Shell und Env-Validierung. |
| `scripts/` | Lokale Hilfs- und Smoke-Test-Skripte. |
| `prisma/` | Prisma-Schema und Migrationen für Supabase Postgres. |
| `docs/` | Architektur-, Entscheidungs- und Bedienungsdokumentation. |

## Betriebs- und Sicherheitsnotizen

- Keine echten Secrets, Tokens, Datenbank-URLs oder API-Keys committen.
- `.env.example` ist nur Vorlage; echte Werte gehören in `.env` oder in die Secret-Verwaltung der Zielumgebung.
- Supabase Postgres ist die kanonische Datenbank. Lokale Postgres-Setups nur bewusst und nach expliziter Freigabe nutzen.
- Smoke-Tests können gegen die konfigurierte Datenbank schreiben. Vor Ausführung Zielumgebung prüfen.
- Rollen und Berechtigungen müssen vor Produktiveinsatz fachlich und technisch geprüft werden.
- Der aktuelle Rollen-Kontext über Actor-Header ist kein vollständiges produktives Auth-System.
- Raw Payloads und externe POS-Daten können sensible Betriebsinformationen enthalten und dürfen nicht ungefiltert in UI, Logs oder Reports erscheinen.

## Roadmap / Nächste Schritte

- Warenwirtschaftslogik für operative Sonderfälle finalisieren.
- Rollen- und Rechteprüfung härten, inklusive produktivem Login/Auth.
- Staff-Flows für mobile Nutzung und eigenen Verlauf fertig anbinden.
- Benutzerführung bei Fehlbuchungen, Korrekturen und Review-Entscheidungen verbessern.
- Mobile Nutzung weiter optimieren.
- Gastronovi-/HOTAPI-Anbindung mit echten Source-Verträgen und Payload-Beispielen vorbereiten.
- Agenten-Logbook und Projekt-SoT nur dann ergänzen, wenn die repo-lokalen Governance-Flächen dies ausdrücklich übernehmen.

<!-- workspace-root-sync:readme:start -->
## Workspace Integration

This repository lives under `/home/baum/Schreibtisch/workspace/main_projects`. Its local `README.md`, `AGENTS.md`, `docs/`, manifests, contracts, validators, tests, and workflow files remain the authority for repo-specific product, runtime, archive, and implementation truth.

The workspace root is a routing and orientation layer. It points agents and humans to the correct authority surface; it must not be treated as a replacement for this repository's local truth.

### Workspace Work Path

```text
frontdoor -> authority check -> scope check -> reusable-surface check -> smallest safe work -> verification -> evidence / next gate
```

When work enters from the workspace root:

1. Read root `README.md` and root `AGENTS.md`.
2. Read this repository's `README.md`, `AGENTS.md`, and relevant local docs or contracts.
3. Identify the owning authority, scope, next gate, expected write targets, and validation path.
4. Check whether existing repo-local or shared-core assets already cover the task.
5. Make the smallest safe change and verify it locally.
6. Close with evidence, unresolved gaps, and the next re-entry pointer.

### Cross-Repo And Reusable Work

- Use portfolio surfaces for workspace inventory, cross-repo coordination, intake, disposition, daily notes, commit evidence, and re-entry tracking.
- Use `model-agnostic-workflow-system/` for reusable skills, contracts, templates, validators, provider exports, and workflow routing patterns.
- Do not duplicate root, portfolio, shared-core, or chat-room governance here unless this repository deliberately adopts a local copy.
- If this repository is `model-agnostic-workflow-system`, its own `AGENTS.md` and `WORKFLOW.md` are the local shared-core authority before reusable behavior is exported elsewhere.

### Evidence And Closure

Close meaningful work with:

- `Observed` facts from exact paths or commands;
- `Inferred` conclusions clearly labelled;
- `Applied` changes with exact paths;
- `Verified` checks or read-backs;
- `BLOCKED` items where authority, source, scope, validation, or permissions are insufficient;
- the next gate or re-entry pointer.

Do not treat summaries, imports, chat notes, MSPR packets, loose docs, archives, or derived knowledge as canonical truth until the owning surface has reviewed and promoted them.
<!-- workspace-root-sync:readme:end -->
