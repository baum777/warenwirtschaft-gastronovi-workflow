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
});
