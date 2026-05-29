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
    expect(html).not.toContain('id="dev-form"');
    expect(html).not.toContain('id="api-base"');
    expect(html).not.toContain('id="actor-id"');
    expect(html).not.toContain('id="actor-role"');
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
      "view-review-tasks",
      "view-audit-trail"
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
      "review-tasks",
      "audit-trail",
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

  it("keeps staff role focused on operational flows and correction reporting", () => {
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
    expect(app).toContain('corrections: {\n    title: "Korrekturen",\n    roles: ["admin", "shift_lead", "staff"]');
    expect(app).toContain('"goods-receipts": {\n    title: "Wareneingang",\n    roles: ["admin", "shift_lead"]');
    expect(app).toContain('"purchase-orders": {\n    title: "Bestellungen",\n    roles: ["admin", "shift_lead"]');
    expect(app).toContain('"review-tasks": {\n    title: "Prüfung",\n    roles: ["admin"]');
    expect(app).toContain('"audit-trail": {\n    title: "Audit Verlauf",\n    roles: ["admin", "shift_lead"]');
    expect(html).toContain("Fehler melden");
  });

  it("renders role-based nav state with aria-current and a top context bar", () => {
    const html = readWebFile("index.html");
    const app = readWebFile("app.js");
    const styles = readWebFile("styles.css");

    expect(html).toContain('id="sidebar-nav-list"');
    expect(html).toContain('id="sidebar-close"');
    expect(html).toContain('aria-label="Navigation schließen"');
    expect(html).toContain('id="mobile-nav"');
    expect(html).toContain('id="context-role"');
    expect(html).toContain('id="context-location"');
    expect(html).toContain('id="context-connection"');
    expect(app).toContain("sidebarClose");
    expect(app).toContain('localStorage.setItem("ww.sidebarCollapsed", "1")');
    expect(app).toContain("renderRoleNavigation");
    expect(app).toContain('item.setAttribute("aria-current", "page")');
    expect(app).toContain("renderTopContextBar");
    expect(styles).toContain(".sidebar-close");
    expect(styles).toContain(".app-shell.is-sidebar-collapsed .sidebar-close");
  });

  it("keeps sidebar workspace routing keys for corrections and review explicit", () => {
    const html = readWebFile("index.html");
    const app = readWebFile("app.js");

    expect(html).toContain('data-workspace="corrections"');
    expect(html).toContain('data-workspace="review-tasks"');
    expect(app).toContain("if (workspace) {");
    expect(app).toContain("return;");
    expect(app).toContain('korrekturen: "corrections"');
    expect(app).toContain('pruefung: "review-tasks"');
    expect(app).toContain('prüfung: "review-tasks"');
    expect(app).toContain('bestellungen: "purchase-orders"');
    expect(app).toContain('wareneingang: "goods-receipts"');
    expect(app).toContain('entnahmen: "withdrawals"');
    expect(app).toContain('schnellbuchen: "quick-booking"');
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

  it("keeps item-driven form defaults deterministic across all booking inputs", () => {
    const app = readWebFile("app.js");

    expect(app).toContain('form.elements.storageLocationId.value = item.storageLocationId || "";');
    expect(app).toContain('form.elements.storageLocationId.value = "";');
    expect(app).toContain('if (!itemId) {');
    expect(app).toContain("Bestand wird nach Artikelauswahl angezeigt.");
  });

  it("validates quick-booking receipts separately from withdrawal stock limits", () => {
    const app = readWebFile("app.js");

    expect(app).toContain("#quick-booking-form [name='movementType']");
    expect(app).toContain('form.elements.movementType?.value === "goods-receipt"');
    expect(app).toContain("Wareneingang erhöht den Bestand.");
  });

  it("binds CSV import, export, and reset controls to admin inventory endpoints", () => {
    const html = readWebFile("index.html");
    const app = readWebFile("app.js");
    const styles = readWebFile("styles.css");

    expect(html).toContain('id="csv-import-file"');
    expect(html).toContain('data-action="export-csv"');
    expect(html).toContain('data-action="import-csv"');
    expect(html).toContain('data-action="reset-inventory"');
    expect(app).toContain("function exportInventoryCsv");
    expect(app).toContain("/admin/inventory/csv");
    expect(app).toContain("/admin/inventory/csv-import");
    expect(app).toContain("/admin/inventory/reset");
    expect(app).toContain("apiTextFetch");
    expect(styles).toContain(".data-actions");
    expect(styles).toContain(".danger-action");
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

  it("supports desktop goods-receipt and withdrawal command flows with stock-effect signals", () => {
    const html = readWebFile("index.html");
    const app = readWebFile("app.js");
    const styles = readWebFile("styles.css");

    expect(html).toContain('id="goods-receipt-mode"');
    expect(html).toContain("Freier Wareneingang");
    expect(html).toContain('data-command-payload="RecordGoodsReceiptCommand"');
    expect(html).toContain('data-command-payload="RecordWithdrawalCommand"');
    expect(html).toContain('data-command-stock-warning');
    expect(html).toContain('aria-label="Entnahmegrund auswählen"');
    expect(html).toContain("Grund wählen");

    expect(app).toContain("applyGoodsReceiptMode");
    expect(app).toContain("buildRecordGoodsReceiptCommand");
    expect(app).toContain("buildRecordWithdrawalCommand");
    expect(app).toContain("toGoodsReceiptRequest");
    expect(app).toContain("toWithdrawalRequest");
    expect(app).toContain("composeWithdrawalNote");
    expect(app).toContain("getStockWarningMessage");
    expect(app).toContain("Bestand steigt");
    expect(app).toContain("Bestand sinkt");
    expect(app).toContain("Bestellung verändert Bestand nicht");
    expect(app).toContain("RecordGoodsReceiptCommand");
    expect(app).toContain("RecordWithdrawalCommand");

    expect(styles).toContain(".command-stock-warning");
    expect(styles).toContain(".command-stock-warning.is-warning");
    expect(styles).toContain(".command-effect-intent");
    expect(styles).toContain(".field-hint");
  });

  it("implements command feedback toasts, duplicate state, and timeout retry handling", () => {
    const html = readWebFile("index.html");
    const app = readWebFile("app.js");
    const styles = readWebFile("styles.css");

    expect(html).toContain('id="toast-zone"');
    expect(html).toContain('data-command-warning-banner');
    expect(html).toContain("data-command-retry");
    expect(html).toContain("Erneut senden");

    expect(app).toContain("buildCommandSuccessMessage");
    expect(app).toContain("buildCommandFailureFeedback");
    expect(app).toContain('duplicate: "Bereits gebucht"');
    expect(app).toContain("Netzwerk-Timeout");
    expect(app).toContain("Bereits gebucht. Bestand wurde nicht erneut verändert. Verlauf prüfen.");
    expect(app).toContain("Wareneingang gebucht. Bestand");
    expect(app).toContain("Entnahme gespeichert. Bestand");
    expect(app).toContain("Korrektur beantragt. Admin prüft, kein Bestandseffekt.");
    expect(app).toContain("commandRequestTimeoutMs");
    expect(app).toContain("toastZone.prepend(toast)");
    expect(app).toContain('tone === "error" ? "alert" : "status"');

    expect(styles).toContain(".toast-zone");
    expect(styles).toContain(".toast-item");
    expect(styles).toContain(".toast-item.is-error");
    expect(styles).toContain(".warning-banner");
    expect(styles).toContain("[data-command-retry]");
  });

  it("supports correction requests with admin-only review cards, drawer context, and approve/reject actions", () => {
    const html = readWebFile("index.html");
    const app = readWebFile("app.js");
    const styles = readWebFile("styles.css");

    expect(html).toContain('data-command-payload="RequestCorrectionCommand"');
    expect(html).toContain('id="review-task-card-list"');
    expect(html).toContain('id="review-task-drawer"');
    expect(html).toContain('id="review-task-context"');
    expect(html).toContain('id="review-task-history"');
    expect(html).toContain('id="review-task-actions"');
    expect(html).toContain('data-action="close-review-task-drawer"');

    expect(app).toContain("buildRequestCorrectionCommand");
    expect(app).toContain("rememberCorrectionReviewMapping");
    expect(app).toContain("renderReviewTaskCards");
    expect(app).toContain("renderReviewTaskDrawer");
    expect(app).toContain("submitReviewCommand");
    expect(app).toContain("buildApproveCorrectionCommand");
    expect(app).toContain("buildRejectCorrectionCommand");
    expect(app).toContain("buildResolveReviewTaskCommand");
    expect(app).toContain("hydrateCorrectionReviewIndexFromTasks");
    expect(app).toContain("task.correctionRequestId");
    expect(app).toContain("inventory.correction_request");
    expect(app).toContain('WarenwirtschaftApp.state.actorRole !== "admin"');
    expect(app).toContain("/admin/correction-requests/");
    expect(app).toContain("/admin/review-tasks/");

    expect(styles).toContain(".review-queue-layout");
    expect(styles).toContain(".review-card-list");
    expect(styles).toContain(".review-task-drawer");
    expect(styles).toContain(".review-task-context");
    expect(styles).toContain(".review-task-action-grid");
  });

  it("renders a read-only audit timeline workspace with filters, movement details, and no-go guards", () => {
    const html = readWebFile("index.html");
    const app = readWebFile("app.js");
    const styles = readWebFile("styles.css");

    for (const id of [
      "view-audit-trail",
      "audit-filter-date-from",
      "audit-filter-date-to",
      "audit-filter-item",
      "audit-filter-type",
      "audit-filter-actor",
      "audit-filter-location",
      "audit-events-table",
      "movement-timeline",
      "audit-detail-drawer",
      "audit-detail-grid"
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain("Movement Detail");
    expect(html).toContain("Read-only Audit");

    expect(app).toContain("loadAuditTrail");
    expect(app).toContain("bindAuditWorkspaceEvents");
    expect(app).toContain("AuditEventRow");
    expect(app).toContain("MovementTimeline");
    expect(app).toContain("renderAuditDetailIfSelected");
    expect(app).toContain("movement_id");
    expect(app).toContain("idempotency_key");
    expect(app).toContain("correlation_id");
    expect(app).toContain("source_type");
    expect(app).toContain("source_id");

    expect(styles).toContain(".audit-filter-bar");
    expect(styles).toContain(".audit-layout");
    expect(styles).toContain(".audit-detail-drawer");
    expect(styles).toContain(".movement-timeline");

    expect(html).not.toContain("Movement bearbeiten");
    expect(html).not.toContain("Movement löschen");
    expect(html).not.toContain("Bestand setzen");
    expect(html).not.toContain("Snapshot überschreiben");
    expect(html).not.toContain('data-command-primary">Speichern');
    expect(app).toContain('WarenwirtschaftApp.state.actorRole !== "admin"');
  });

  it("provides a staff-first mobile execution mode with action cards, stepper, and stock-effect success screen", () => {
    const html = readWebFile("index.html");
    const app = readWebFile("app.js");
    const styles = readWebFile("styles.css");

    expect(html).toContain('id="mobile-staff-start"');
    expect(html).toContain('id="mobile-action-card-grid"');
    expect(html).toContain('id="quick-mobile-stepper"');
    expect(html).toContain('id="mobile-success-screen"');
    expect(html).toContain("data-mobile-step");
    expect(html).toContain("data-mobile-step-back");
    expect(html).toContain("data-mobile-step-next");
    expect(html).toContain("data-mobile-success-reset");
    expect(html).toContain("Kein Undo. Fehler immer über „Fehler melden“.");

    expect(app).toContain("mobileStaffActionCards");
    expect(app).toContain("quickBookingMobileStepCount");
    expect(app).toContain("mobileActionCardMarkup");
    expect(app).toContain("bindMobileStaffFlowEvents");
    expect(app).toContain("syncMobileStaffQuickBookingMode");
    expect(app).toContain("advanceQuickBookingMobileStep");
    expect(app).toContain("retreatQuickBookingMobileStep");
    expect(app).toContain("setQuickBookingMobileSuccess");
    expect(app).toContain("resetQuickBookingMobileSuccess");
    expect(app).toContain('staff: ["quick-booking", "staff-history", "staff-hints"]');

    expect(styles).toContain(".mobile-action-card");
    expect(styles).toContain(".mobile-stepper");
    expect(styles).toContain(".mobile-success-screen");
    expect(styles).toContain(".command-form.is-mobile-staff-mode .sticky-action-footer");
    expect(styles).toContain("min-height: 48px");
  });

  it("hardens accessibility focus-flow, responsive breakpoints, and post-commit refresh edge cases", () => {
    const html = readWebFile("index.html");
    const app = readWebFile("app.js");
    const styles = readWebFile("styles.css");

    expect(html).toContain('id="workspace-panel"');
    expect(html).toContain('id="toast-zone"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="false"');
    expect(html).toContain('id="stock-detail-drawer"');
    expect(html).toContain('aria-labelledby="stock-detail-title"');
    expect(html).toContain('id="review-task-drawer"');
    expect(html).toContain('aria-labelledby="review-task-title"');
    expect(html).toContain('id="audit-detail-drawer"');
    expect(html).toContain('aria-labelledby="audit-detail-title"');

    expect(app).toContain("activateFocusTrap");
    expect(app).toContain("releaseFocusTrap");
    expect(app).toContain("handleFocusTrapTabKey");
    expect(app).toContain("runPostCommitRefresh");
    expect(app).toContain("postCommitRefreshFailureMessage");
    expect(app).toContain("normalizeUnitLabel");
    expect(app).toContain("Rolle gewechselt:");

    expect(styles).toContain("input:focus-visible");
    expect(styles).toContain(".workspace-panel:focus-visible");
    expect(styles).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
    expect(styles).toContain("@media (min-width: 480px) and (max-width: 1023px)");
    expect(styles).toContain("@media (min-width: 1024px) and (max-width: 1439px)");
    expect(styles).toContain("@media (min-width: 1440px)");
  });
});
