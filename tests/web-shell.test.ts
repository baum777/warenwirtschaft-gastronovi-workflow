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

  it("exposes purchase-order actions without stock-changing item edits", () => {
    const app = readWebFile("app.js");

    expect(app).toContain("/admin/purchase-orders/${id}/mark-ordered");
    expect(app).toContain("data-order-action");
    expect(app).toContain("body: JSON.stringify({})");
    expect(app).not.toContain('apiFetch(`/admin/inventory/items/${id}`');
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
      "review-tasks"
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
    expect(html).toContain("Bestand prüfen");
    expect(html).toContain("Kritische Bestände");
    expect(html).toContain('data-workspace-tab="critical"');
    expect(html).toContain('data-workspace-filter="critical"');
    expect(html).toContain("Touch-optimierte Sofortbuchung");
    expect(styles).toContain(".workspace-card-grid");
    expect(styles).toContain(".status-card.is-clickable");
  });

  it("keeps staff workspace access restricted while allowing stock, quick booking, and corrections", () => {
    const html = readWebFile("index.html");
    const app = readWebFile("app.js");

    expect(html).toContain('data-workspace="quick-booking"');
    expect(app).toContain('stock: {\n    title: "Bestand",\n    roles: ["admin", "shift_lead", "staff"]');
    expect(app).toContain('"quick-booking": {\n    title: "Schnellbuchen",\n    roles: ["admin", "shift_lead", "staff"]');
    expect(app).toContain('"goods-receipts": {\n    title: "Wareneingang",\n    roles: ["admin", "shift_lead"]');
    expect(app).toContain('"purchase-orders": {\n    title: "Bestellungen",\n    roles: ["admin", "shift_lead"]');
    expect(app).toContain('"review-tasks": {\n    title: "Prüfung",\n    roles: ["admin"]');
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
});
