import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readWebFile(path: string): string {
  return readFileSync(join(process.cwd(), "web", path), "utf8");
}

describe("Warenwirtschaft web shell", () => {
  it("defines the static web app entry files", () => {
    expect(readWebFile("index.html")).toContain('id="app"');
    expect(readWebFile("index.html")).toContain("warenwirtschaft-app");
    expect(readWebFile("styles.css")).toContain(".app-shell");
    expect(readWebFile("index.html")).toContain('id="top-context-bar"');
    expect(readWebFile("index.html")).toContain('id="mobile-nav"');
    expect(readWebFile("app.js")).toContain("WarenwirtschaftApp");
  });

  it("sends actor headers with API requests", () => {
    const app = readWebFile("app.js");

    expect(app).toContain('"x-actor-id"');
    expect(app).toContain('"x-actor-role"');
    expect(app).toContain("apiFetch");
  });

  it("keeps production dashboard free of visible development controls", () => {
    const html = readWebFile("index.html");

    expect(html).not.toContain("MVP Cockpit");
    expect(html).toContain("Betriebsübersicht");
    expect(html).toContain('id="dev-panel"');
    expect(html).not.toContain('id="actor-form"');
    expect(html).not.toContain("Lieferant-ID");
    expect(html).not.toContain("Lagerort-ID");
    expect(html).not.toContain("Artikel-ID");
    expect(html).not.toContain("Bestellung-ID");
  });

  it("uses master-data backed controls for the core workflow forms", () => {
    const html = readWebFile("index.html");
    const app = readWebFile("app.js");

    for (const id of [
      "item-storage-location",
      "purchase-order-supplier",
      "purchase-order-item",
      "goods-receipt-order",
      "goods-receipt-item",
      "goods-receipt-location",
      "withdrawal-item",
      "withdrawal-location",
      "correction-item",
      "quick-booking-item"
    ]) {
      expect(html).toContain(`id="${id}"`);
    }

    expect(app).toContain("/inventory/master-data");
    expect(app).toContain("renderMasterDataControls");
    expect(app).toContain("validateWithdrawalStock");
  });

  it("uses the deployed origin as the default API base", () => {
    const app = readWebFile("app.js");

    expect(app).toContain("defaultApiBase");
    expect(app).toContain("window.location.origin");
  });

  it("covers the first MVP inventory workflows", () => {
    const html = readWebFile("index.html");
    const app = readWebFile("app.js");

    for (const id of [
      "view-dashboard",
      "view-items",
      "view-stock",
      "view-purchase-orders",
      "view-goods-receipts",
      "view-withdrawals",
      "view-corrections",
      "view-review-tasks"
    ]) {
      expect(html).toContain(id);
    }

    for (const endpoint of [
      "/admin/inventory/items",
      "/admin/purchase-orders",
      "/goods-receipts",
      "/withdrawals",
      "/correction-requests",
      "/admin/review-tasks",
      "/app-context",
      "/inventory/master-data"
    ]) {
      expect(app).toContain(endpoint);
    }
  });

  it("defines the workspace overlay shell and workspace entry points", () => {
    const html = readWebFile("index.html");
    const styles = readWebFile("styles.css");

    for (const selector of ["workspace-overlay", "workspace-backdrop", "workspace-panel"]) {
      expect(html).toContain(selector);
      expect(styles).toContain(`.${selector}`);
    }

    for (const workspace of [
      "items",
      "stock",
      "purchase-orders",
      "goods-receipts",
      "withdrawals",
      "quick-booking",
      "corrections",
      "review-tasks",
      "staff-history",
      "staff-hints"
    ]) {
      expect(html).toContain(`data-workspace="${workspace}"`);
    }
  });

  it("exposes workspace state helpers and keeps role-gated workspace access explicit", () => {
    const app = readWebFile("app.js");

    for (const stateKey of ["activeWorkspace", "activeWorkspaceTab", "activeWorkspaceFilter"]) {
      expect(app).toContain(stateKey);
    }

    for (const helper of ["openWorkspace", "closeWorkspace", "setWorkspaceTab", "setWorkspaceFilter"]) {
      expect(app).toContain(`function ${helper}`);
    }

    expect(app).toContain("getCriticalStockRows");
    expect(app).toContain('roles: ["admin"]');
    expect(app).toContain('roles: ["admin", "shift_lead", "staff"]');
    expect(app).toContain('roles: ["admin", "shift_lead"]');
    expect(app).toContain("canOpenWorkspace");
  });

  it("defines guided dashboard workspace cards and critical-stock KPI drilldown", () => {
    const html = readWebFile("index.html");
    const styles = readWebFile("styles.css");

    expect(html).toContain("workspace-card-grid");
    expect(html).toContain("dashboard-metric-grid");
    expect(html).toContain("Bestand prüfen");
    expect(html).toContain("Kritische Bestände");
    expect(html).toContain('data-workspace-tab="critical"');
    expect(html).toContain('data-workspace-filter="critical"');
    expect(html).toContain("Touch-optimierte Sofortbuchung");
    expect(styles).toContain(".workspace-card-grid");
    expect(styles).toContain(".dashboard-metric-grid");
    expect(styles).toContain(".status-card.is-clickable");
  });

  it("defines dashboard metric card fixtures with loading, empty, and error states", () => {
    const html = readWebFile("index.html");
    const app = readWebFile("app.js");
    const styles = readWebFile("styles.css");

    expect(html).toContain("Statuskarten");
    expect(html).toContain('id="dashboard-metric-grid"');
    expect(app).toContain("dashboardMetricFixtures");
    for (const metricKey of [
      "stock-critical",
      "stock-negative",
      "review-open",
      "purchase-orders-open",
      "purchase-orders-partial",
      "goods-receipts-today",
      "withdrawals-today",
      "corrections-open",
      "items-total"
    ]) {
      expect(app).toContain(`key: "${metricKey}"`);
    }
    expect(app).toContain('state: "loading"');
    expect(app).toContain('state: "empty"');
    expect(app).toContain('state: "error"');
    expect(app).toContain("renderDashboardMetricCards");
    expect(styles).toContain(".dashboard-metric-card.is-loading");
    expect(styles).toContain(".dashboard-metric-card.is-empty");
    expect(styles).toContain(".dashboard-metric-card.is-error");
  });

  it("keeps staff role focused on quick booking, own history, and hints", () => {
    const html = readWebFile("index.html");
    const app = readWebFile("app.js");

    expect(html).toContain('id="view-staff-history"');
    expect(html).toContain('id="view-staff-hints"');
    expect(html).toContain('data-workspace="quick-booking"');
    expect(app).toContain('stock: {\n    title: "Bestand",\n    roles: ["admin", "shift_lead"]');
    expect(app).toContain('"quick-booking": {\n    title: "Schnellbuchen",\n    roles: ["admin", "shift_lead", "staff"]');
    expect(app).toContain('"staff-history": {\n    title: "Eigener Verlauf",\n    roles: ["staff"]');
    expect(app).toContain('"staff-hints": {\n    title: "Hinweise",\n    roles: ["staff"]');
    expect(app).toContain('withdrawals: {\n    title: "Entnahmen",\n    roles: ["admin", "shift_lead"]');
    expect(app).toContain('corrections: {\n    title: "Korrekturen",\n    roles: ["admin", "shift_lead"]');
    expect(app).toContain('"goods-receipts": {\n    title: "Wareneingang",\n    roles: ["admin", "shift_lead"]');
    expect(app).toContain('"purchase-orders": {\n    title: "Bestellungen",\n    roles: ["admin", "shift_lead"]');
    expect(app).toContain('"review-tasks": {\n    title: "Prüfung",\n    roles: ["admin"]');
  });

  it("renders role-based nav state with aria-current and a top context bar", () => {
    const html = readWebFile("index.html");
    const app = readWebFile("app.js");

    expect(html).toContain('id="sidebar-nav-list"');
    expect(html).toContain('id="mobile-nav"');
    expect(html).toContain('id="context-role"');
    expect(html).toContain('id="context-location"');
    expect(html).toContain('id="context-connection"');
    expect(app).toContain("renderRoleNavigation");
    expect(app).toContain('item.setAttribute("aria-current", "page")');
    expect(app).toContain("renderTopContextBar");
  });

  it("defines guided workspace context, critical empty states, and quick-booking reason chips", () => {
    const html = readWebFile("index.html");
    const app = readWebFile("app.js");
    const styles = readWebFile("styles.css");

    expect(html).toContain("workspace-context");
    expect(html).toContain("critical-stock-table");
    expect(html).toContain("Keine kritischen Bestände. Alle Artikel liegen aktuell über Mindestbestand.");
    expect(html).toContain('select name="reason"');
    expect(html).toContain('data-reason-chip="Verbrauch Küche"');
    expect(html).toContain("Zuletzt gebucht");
    expect(app).toContain("bindReasonChips");
    expect(app).toContain("lastQuickBooking");
    expect(styles).toContain(".workspace-context");
    expect(styles).toContain(".reason-chip");
  });

  it("keeps stock workspace read-only with filters, detail drawer, and movement timeline", () => {
    const html = readWebFile("index.html");
    const app = readWebFile("app.js");
    const styles = readWebFile("styles.css");

    for (const id of [
      "stock-filter-status",
      "stock-filter-location",
      "stock-filter-category",
      "stock-filter-search",
      "stock-detail-drawer",
      "stock-detail-master",
      "stock-detail-snapshot",
      "stock-detail-timeline",
      "stock-card-list",
      "critical-stock-card-list"
    ]) {
      expect(html).toContain(`id="${id}"`);
    }

    expect(html).toContain("Snapshot-Read-Model. Keine direkte Bestandsbearbeitung.");
    expect(html).toContain('data-action="close-stock-detail"');
    expect(html).toContain('data-workspace="withdrawals"');
    expect(html).toContain('data-workspace="corrections"');
    expect(html).not.toContain("Bestand setzen");
    expect(html).not.toContain("current_stock");

    expect(app).toContain("bindStockWorkspaceEvents");
    expect(app).toContain("loadStockMovements");
    expect(app).toContain("openStockDetail");
    expect(app).toContain("closeStockDetail");
    expect(app).toContain("getStockTimelineEvents");
    expect(app).toContain('data-stock-detail="');

    expect(styles).toContain(".stock-filter-bar");
    expect(styles).toContain(".stock-layout");
    expect(styles).toContain(".stock-detail-drawer");
    expect(styles).toContain(".stock-movement-timeline");
  });

  it("defines reusable command UI primitives with lifecycle states and idempotency keys", () => {
    const html = readWebFile("index.html");
    const app = readWebFile("app.js");
    const styles = readWebFile("styles.css");

    for (const formName of ["purchase-order", "goods-receipt", "withdrawal", "quick-booking", "correction"]) {
      expect(html).toContain(`data-command-form="${formName}"`);
    }

    for (const selector of [
      'data-item-picker',
      'data-location-selector',
      'data-quantity-input',
      'data-unit-selector',
      'data-command-effect-preview',
      'data-command-idempotency-key',
      'data-command-idempotency-input',
      'data-command-form-status',
      'data-command-primary'
    ]) {
      expect(html).toContain(selector);
    }

    expect(html).toContain("Wareneingang buchen");
    expect(html).toContain("Entnahme buchen");
    expect(html).toContain("Korrektur beantragen");
    expect(html).toContain('id="confirm-command-dialog"');
    expect(html).toContain("confirm-command-title");

    expect(app).toContain("submitCommandForm");
    expect(app).toContain("calculateCommandEffect");
    expect(app).toContain("openConfirmCommandDialog");
    expect(app).toContain("generateIdempotencyKey");
    expect(app).toContain("commandFormStatusLabel");
    expect(app).toContain('"x-idempotency-key"');
    expect(app).toContain('idle: "Bereit"');
    expect(app).toContain('submitting: "Command wird gesendet"');
    expect(app).toContain('failed: "Command fehlgeschlagen"');

    expect(styles).toContain(".command-form");
    expect(styles).toContain(".command-effect-preview");
    expect(styles).toContain(".sticky-action-footer");
    expect(styles).toContain(".confirm-command-dialog");
  });
});
