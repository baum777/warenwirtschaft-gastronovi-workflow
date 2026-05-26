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
      "/admin/inventory/stock",
      "/admin/purchase-orders",
      "/goods-receipts",
      "/goods-receipts/",
      "/withdrawals",
      "/correction-requests",
      "/admin/review-tasks"
    ]) {
      expect(app).toContain(endpoint);
    }
  });

  it("renders a goods receipt detail surface in the web shell", () => {
    const html = readWebFile("index.html");
    const app = readWebFile("app.js");

    expect(html).toContain("goods-receipt-detail");
    expect(html).toContain('name="receivedAt"');
    expect(html).toContain('name="note"');
    expect(app).toContain("loadGoodsReceiptDetail");
    expect(app).toContain("data-goods-receipt-id");
  });
});
