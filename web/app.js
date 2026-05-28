const WarenwirtschaftApp = {
  state: {
    apiBase: localStorage.getItem("ww.apiBase") || defaultApiBase(),
    actorId: localStorage.getItem("ww.actorId") || "demo-admin",
    actorRole: localStorage.getItem("ww.actorRole") || "admin",
    appContext: {
      demoMode: false,
      devPanelEnabled: false,
      defaultActor: {
        userId: "demo-admin",
        role: "admin"
      }
    },
    masterData: emptyMasterData(),
    reviewTasks: []
  },
  refs: {}
};

const columns = {
  items: ["Name", "SKU", "Kategorie", "Einheit", "Mindestbestand", "Lagerort"],
  stock: ["Artikel", "Kategorie", "Bestand", "Einheit", "Status", "Letzte Bewegung"],
  orders: ["Status", "Lieferant", "Positionen"],
  receipts: ["Bestellung", "Empfangen von", "Positionen"],
  tasks: ["Typ", "Status", "Schwere", "Titel", "Aktion"]
};

const roleViews = {
  admin: new Set([
    "dashboard",
    "items",
    "stock",
    "purchase-orders",
    "goods-receipts",
    "withdrawals",
    "quick-booking",
    "corrections",
    "review-tasks"
  ]),
  shift_lead: new Set([
    "dashboard",
    "stock",
    "purchase-orders",
    "goods-receipts",
    "withdrawals",
    "quick-booking",
    "corrections"
  ]),
  staff: new Set(["dashboard", "stock", "withdrawals", "quick-booking", "corrections"])
};

document.addEventListener("DOMContentLoaded", () => {
  void boot();
});

async function boot() {
  cacheRefs();
  bindNavigation();
  bindDevForm();
  bindForms();
  bindActions();
  bindMasterDataEvents();

  await loadAppContext();
  applyAppContext();
  syncDevForm();
  applyRoleVisibility();
  await refreshDashboard();
}

function defaultApiBase() {
  if (window.location.protocol === "file:") {
    return "http://localhost:4000";
  }

  if (
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") &&
    window.location.port !== "4000"
  ) {
    return "http://localhost:4000";
  }

  return window.location.origin;
}

function emptyMasterData() {
  return {
    suppliers: [],
    storageLocations: [],
    items: [],
    stock: [],
    openPurchaseOrders: []
  };
}

function cacheRefs() {
  WarenwirtschaftApp.refs = {
    title: document.querySelector("#view-title"),
    toast: document.querySelector("#toast"),
    devPanel: document.querySelector("#dev-panel"),
    apiBase: document.querySelector("#api-base"),
    actorId: document.querySelector("#actor-id"),
    actorRole: document.querySelector("#actor-role"),
    withdrawalStockHint: document.querySelector("#withdrawal-stock-hint"),
    quickBookingStockHint: document.querySelector("#quick-booking-stock-hint")
  };
}

function bindNavigation() {
  document.querySelectorAll("[data-view], [data-view-link]").forEach((element) => {
    element.addEventListener("click", () => {
      const view = element.dataset.view || element.dataset.viewLink;
      if (view) {
        showView(view);
      }
    });
  });
}

function bindDevForm() {
  document.querySelector("#dev-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    WarenwirtschaftApp.state.apiBase = WarenwirtschaftApp.refs.apiBase.value.trim();
    WarenwirtschaftApp.state.actorId = WarenwirtschaftApp.refs.actorId.value.trim();
    WarenwirtschaftApp.state.actorRole = WarenwirtschaftApp.refs.actorRole.value;
    localStorage.setItem("ww.apiBase", WarenwirtschaftApp.state.apiBase);
    localStorage.setItem("ww.actorId", WarenwirtschaftApp.state.actorId);
    localStorage.setItem("ww.actorRole", WarenwirtschaftApp.state.actorRole);
    applyRoleVisibility();
    showToast("Dev-Kontext gespeichert.");
    await refreshDashboard();
  });
}

function bindForms() {
  document.querySelector("#item-form").addEventListener("submit", submitItem);
  document.querySelector("#purchase-order-form").addEventListener("submit", submitPurchaseOrder);
  document.querySelector("#goods-receipt-form").addEventListener("submit", submitGoodsReceipt);
  document.querySelector("#withdrawal-form").addEventListener("submit", submitWithdrawal);
  document.querySelector("#quick-booking-form").addEventListener("submit", submitQuickBooking);
  document.querySelector("#correction-form").addEventListener("submit", submitCorrection);
}

function bindActions() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) {
      return;
    }

    void runAction(target.dataset.action, target);
  });
}

function bindMasterDataEvents() {
  document.querySelector("#purchase-order-item").addEventListener("change", (event) => {
    syncItemDefaults(event.target.value, "#purchase-order-form");
  });
  document.querySelector("#goods-receipt-order").addEventListener("change", prefillReceiptFromOrder);
  document.querySelector("#goods-receipt-item").addEventListener("change", (event) => {
    syncItemDefaults(event.target.value, "#goods-receipt-form");
  });
  document.querySelector("#withdrawal-item").addEventListener("change", () => {
    syncWithdrawalDefaults("#withdrawal-form", WarenwirtschaftApp.refs.withdrawalStockHint);
  });
  document.querySelector("#withdrawal-form [name='quantity']").addEventListener("input", () => {
    validateWithdrawalStock("#withdrawal-form", WarenwirtschaftApp.refs.withdrawalStockHint);
  });
  document.querySelector("#quick-booking-item").addEventListener("change", () => {
    syncWithdrawalDefaults("#quick-booking-form", WarenwirtschaftApp.refs.quickBookingStockHint);
  });
  document.querySelector("#quick-booking-form [name='quantity']").addEventListener("input", () => {
    validateWithdrawalStock("#quick-booking-form", WarenwirtschaftApp.refs.quickBookingStockHint);
  });
  document.querySelector("#correction-item").addEventListener("change", (event) => {
    syncItemDefaults(event.target.value, "#correction-form");
  });
}

async function loadAppContext() {
  try {
    WarenwirtschaftApp.state.appContext = await apiFetch("/app-context", {
      includeActor: false
    });
  } catch (_error) {
    WarenwirtschaftApp.state.appContext = {
      demoMode: false,
      devPanelEnabled: window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1",
      defaultActor: {
        userId: "demo-admin",
        role: "admin"
      }
    };
  }
}

function applyAppContext() {
  const context = WarenwirtschaftApp.state.appContext;
  WarenwirtschaftApp.refs.devPanel.hidden = !context.devPanelEnabled;

  if (!localStorage.getItem("ww.actorId")) {
    WarenwirtschaftApp.state.actorId = context.defaultActor.userId;
  }

  if (!localStorage.getItem("ww.actorRole")) {
    WarenwirtschaftApp.state.actorRole = context.defaultActor.role;
  }
}

function syncDevForm() {
  WarenwirtschaftApp.refs.apiBase.value = WarenwirtschaftApp.state.apiBase;
  WarenwirtschaftApp.refs.actorId.value = WarenwirtschaftApp.state.actorId;
  WarenwirtschaftApp.refs.actorRole.value = WarenwirtschaftApp.state.actorRole;
}

function applyRoleVisibility() {
  const role = WarenwirtschaftApp.state.actorRole;
  document.querySelectorAll("[data-roles]").forEach((element) => {
    const roles = element.dataset.roles.split(" ");
    element.hidden = !roles.includes(role);
  });

  document.querySelectorAll("[data-view]").forEach((element) => {
    const view = element.dataset.view;
    if (!view) {
      return;
    }
    element.hidden = !roleViews[role]?.has(view);
  });

  const active = document.querySelector(".view.is-active");
  const activeName = active?.id.replace("view-", "");
  if (activeName && !roleViews[role]?.has(activeName)) {
    showView("dashboard");
  }
}

function showView(viewName) {
  if (!roleViews[WarenwirtschaftApp.state.actorRole]?.has(viewName)) {
    viewName = "dashboard";
  }

  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("is-active", view.id === `view-${viewName}`);
    if (view.id === `view-${viewName}`) {
      WarenwirtschaftApp.refs.title.textContent = view.dataset.title;
    }
  });
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.view === viewName);
  });
}

async function apiFetch(path, options = {}) {
  const { includeActor = true, ...fetchOptions } = options;
  const headers = {
    "content-type": "application/json",
    ...(includeActor
      ? {
          "x-actor-id": WarenwirtschaftApp.state.actorId,
          "x-actor-role": WarenwirtschaftApp.state.actorRole
        }
      : {}),
    ...(fetchOptions.headers || {})
  };
  const response = await fetch(`${WarenwirtschaftApp.state.apiBase}${path}`, {
    ...fetchOptions,
    headers
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.message || `HTTP ${response.status}`);
  }

  return payload;
}

async function refreshDashboard() {
  const results = await Promise.allSettled([
    loadMasterData(),
    canUseAdminReviewTasks() ? loadReviewTasks() : Promise.resolve()
  ]);
  const failed = results.find((result) => result.status === "rejected");

  if (failed?.status === "rejected") {
    showToast(failed.reason.message, true);
  }
}

async function runAction(action, button) {
  await withButtonState(button, async () => {
    if (action === "refresh-all") {
      await refreshDashboard();
    }
    if (action === "load-items") {
      renderItems();
    }
    if (action === "load-stock") {
      renderStock();
    }
    if (action === "load-purchase-orders") {
      renderPurchaseOrders();
    }
    if (action === "load-goods-receipts") {
      await loadGoodsReceipts();
    }
    if (action === "load-review-tasks") {
      await loadReviewTasks();
    }
  });
}

async function loadMasterData() {
  WarenwirtschaftApp.state.masterData = await apiFetch("/inventory/master-data");
  renderMasterDataControls();
  renderItems();
  renderStock();
  renderPurchaseOrders();
  updateMetrics();
}

function renderMasterDataControls() {
  const data = WarenwirtschaftApp.state.masterData;
  fillSelect("#item-storage-location", data.storageLocations, "storageLocationId", "name", "Kein Lagerort");
  fillSelect("#purchase-order-supplier", data.suppliers, "supplierId", "name", "Ohne Lieferant");
  fillSelect("#purchase-order-item", data.items, "inventoryItemId", itemOptionText, "Artikel wählen");
  fillSelect("#goods-receipt-order", data.openPurchaseOrders, "purchaseOrderId", orderOptionText, "Ohne Bestellung");
  fillSelect("#goods-receipt-item", data.items, "inventoryItemId", itemOptionText, "Artikel wählen");
  fillSelect("#goods-receipt-location", data.storageLocations, "storageLocationId", "name", "Kein Lagerort");
  fillSelect("#withdrawal-item", data.items, "inventoryItemId", itemOptionText, "Artikel wählen");
  fillSelect("#withdrawal-location", data.storageLocations, "storageLocationId", "name", "Kein Lagerort");
  fillSelect("#correction-item", data.items, "inventoryItemId", itemOptionText, "Artikel wählen");
  fillSelect("#quick-booking-item", data.items, "inventoryItemId", itemOptionText, "Artikel wählen");
  syncWithdrawalDefaults("#withdrawal-form", WarenwirtschaftApp.refs.withdrawalStockHint);
  syncWithdrawalDefaults("#quick-booking-form", WarenwirtschaftApp.refs.quickBookingStockHint);
}

function fillSelect(selector, rows, valueKey, label, emptyLabel) {
  const select = document.querySelector(selector);
  const currentValue = select.value;
  const labelFn = typeof label === "function" ? label : (row) => row[label];
  select.innerHTML = [`<option value="">${escapeHtml(emptyLabel)}</option>`]
    .concat(
      rows.map(
        (row) => `<option value="${escapeHtml(row[valueKey])}">${escapeHtml(labelFn(row))}</option>`
      )
    )
    .join("");

  if (rows.some((row) => row[valueKey] === currentValue)) {
    select.value = currentValue;
  }
}

function itemOptionText(item) {
  return `${item.name} · ${item.defaultUnit}${item.storageLocationName ? ` · ${item.storageLocationName}` : ""}`;
}

function orderOptionText(order) {
  const supplier = order.supplierName || "Ohne Lieferant";
  const positions = order.items
    .filter((item) => item.pendingQty > 0)
    .map((item) => `${item.inventoryItemName || item.inventoryItemId} ${item.pendingQty} ${item.unit}`)
    .join(", ");

  return `${supplier} · ${positions || order.status}`;
}

function prefillReceiptFromOrder(event) {
  const order = findOrder(event.target.value);
  if (!order) {
    return;
  }

  const firstPendingItem = order.items.find((item) => item.pendingQty > 0) || order.items[0];
  if (!firstPendingItem) {
    return;
  }

  const form = document.querySelector("#goods-receipt-form");
  form.elements.inventoryItemId.value = firstPendingItem.inventoryItemId;
  form.elements.quantity.value = firstPendingItem.pendingQty || firstPendingItem.orderedQty;
  form.elements.unit.value = firstPendingItem.unit;
  syncItemDefaults(firstPendingItem.inventoryItemId, "#goods-receipt-form");
}

function syncItemDefaults(itemId, formSelector) {
  const item = findItem(itemId);
  if (!item) {
    return;
  }

  const form = document.querySelector(formSelector);
  if (form.elements.unit) {
    form.elements.unit.value = item.defaultUnit;
  }
  if (form.elements.storageLocationId && item.storageLocationId) {
    form.elements.storageLocationId.value = item.storageLocationId;
  }
}

function syncWithdrawalDefaults(formSelector, hint) {
  const form = document.querySelector(formSelector);
  const item = findItem(form.elements.inventoryItemId.value);

  if (item) {
    if (form.elements.unit) {
      form.elements.unit.value = item.defaultUnit;
    }
    if (form.elements.storageLocationId && item.storageLocationId) {
      form.elements.storageLocationId.value = item.storageLocationId;
    }
  }

  validateWithdrawalStock(formSelector, hint);
}

function validateWithdrawalStock(formSelector, hint) {
  const form = document.querySelector(formSelector);
  const quantityInput = form.elements.quantity;
  const itemId = form.elements.inventoryItemId.value;
  const stock = findStock(itemId);
  const quantity = Number(quantityInput.value || 0);

  clearFieldError(form, "quantity");
  quantityInput.setCustomValidity("");

  if (!stock) {
    hint.textContent = "Für diesen Artikel liegt noch kein Bestand vor.";
    return true;
  }

  hint.textContent = `Verfügbar: ${stock.currentStock} ${stock.unit}`;

  if (quantity > stock.currentStock) {
    const message = `Maximal verfügbar: ${stock.currentStock} ${stock.unit}.`;
    quantityInput.setCustomValidity(message);
    setFieldError(form, "quantity", message);
    return false;
  }

  return true;
}

function renderItems() {
  const rows = WarenwirtschaftApp.state.masterData.items;
  document.querySelector("#metric-items").textContent = rows.length;
  renderTable("#items-table", columns.items, rows, (item) => [
    item.name,
    item.sku || "-",
    item.category || "-",
    item.defaultUnit,
    item.minStock ?? "-",
    item.storageLocationName || "-"
  ], "Noch keine Artikel vorhanden.", "load-items");
}

function renderStock() {
  const rows = WarenwirtschaftApp.state.masterData.stock;
  const alerts = rows.filter((item) => item.status === "low" || item.status === "negative");
  document.querySelector("#metric-alerts").textContent = alerts.length;
  renderTable("#stock-table", columns.stock, rows, (item) => [
    item.name,
    item.category || "-",
    item.currentStock,
    item.unit,
    statusBadge(item.status, item.status === "negative" ? "is-danger" : item.status === "low" ? "is-warning" : ""),
    item.lastMovementAt ? new Date(item.lastMovementAt).toLocaleString("de-DE") : "-"
  ], "Noch keine Bestandsbewegungen vorhanden.", "load-stock");
}

function renderPurchaseOrders() {
  const rows = WarenwirtschaftApp.state.masterData.openPurchaseOrders;
  document.querySelector("#metric-orders").textContent = rows.length;
  renderTable("#purchase-orders-table", columns.orders, rows, (order) => [
    statusBadge(order.status),
    order.supplierName || order.supplierId || "-",
    order.items.map((item) => `${item.inventoryItemName || item.inventoryItemId}: ${item.pendingQty} ${item.unit}`).join(", ")
  ], "Keine offenen Bestellungen.", "load-purchase-orders");
}

async function loadGoodsReceipts() {
  const payload = await apiFetch("/goods-receipts");
  renderTable("#goods-receipts-table", columns.receipts, payload.goodsReceipts, (receipt) => [
    receipt.purchaseOrderId || "-",
    receipt.receivedById,
    receipt.items.map((item) => `${item.inventoryItemName || item.inventoryItemId}: ${item.quantity} ${item.unit}`).join(", ")
  ], "Noch keine Wareneingänge gebucht.", "load-goods-receipts");
}

async function loadReviewTasks() {
  if (!canUseAdminReviewTasks()) {
    WarenwirtschaftApp.state.reviewTasks = [];
    renderReviewTasks("#dashboard-review-table", []);
    renderReviewTasks("#review-tasks-table", []);
    updateMetrics();
    return;
  }

  const payload = await apiFetch("/admin/review-tasks");
  WarenwirtschaftApp.state.reviewTasks = payload.tasks;
  renderReviewTasks("#review-tasks-table", payload.tasks);
  renderReviewTasks("#dashboard-review-table", payload.tasks.slice(0, 5));
  updateMetrics();
}

function renderReviewTasks(selector, tasks) {
  renderTable(selector, columns.tasks, tasks, (task) => [
    task.type,
    statusBadge(task.status, task.status === "open" ? "is-warning" : ""),
    task.severity,
    task.title,
    canUseAdminReviewTasks() ? actionButtons(task.id) : "-"
  ], "Keine offenen Prüfaufgaben.", "load-review-tasks");
}

function actionButtons(id) {
  return `
    <span class="row-actions">
      <button data-task-action="start-review" data-task-id="${escapeHtml(id)}">Start</button>
      <button data-task-action="resolve" data-task-id="${escapeHtml(id)}">Lösen</button>
      <button data-task-action="dismiss" data-task-id="${escapeHtml(id)}">Verwerfen</button>
    </span>
  `;
}

function updateMetrics() {
  const data = WarenwirtschaftApp.state.masterData;
  const alerts = data.stock.filter((item) => item.status === "low" || item.status === "negative");
  document.querySelector("#metric-items").textContent = data.items.length;
  document.querySelector("#metric-alerts").textContent = alerts.length;
  document.querySelector("#metric-orders").textContent = data.openPurchaseOrders.length;
  document.querySelector("#metric-tasks").textContent = WarenwirtschaftApp.state.reviewTasks.length;
}

async function submitItem(event) {
  event.preventDefault();
  const form = event.target;
  clearFormErrors(form);
  if (!validateRequired(form)) {
    return;
  }

  await withSubmitState(form, async () => {
    await postJson("/admin/inventory/items", normalizeFormValues(formData(form)), "Artikel angelegt.");
    form.reset();
    await loadMasterData();
  });
}

async function submitPurchaseOrder(event) {
  event.preventDefault();
  const form = event.target;
  clearFormErrors(form);
  if (!validateRequired(form)) {
    return;
  }

  const data = formData(form);
  const body = {
    supplierId: data.supplierId || undefined,
    note: data.note || undefined,
    items: [
      {
        inventoryItemId: data.inventoryItemId,
        orderedQty: Number(data.orderedQty),
        unit: data.unit
      }
    ]
  };

  await withSubmitState(form, async () => {
    await postJson("/admin/purchase-orders", body, "Bestellung angelegt.");
    form.reset();
    await loadMasterData();
  });
}

async function submitGoodsReceipt(event) {
  event.preventDefault();
  const form = event.target;
  clearFormErrors(form);
  if (!validateRequired(form)) {
    return;
  }

  const data = formData(form);
  const body = {
    purchaseOrderId: data.purchaseOrderId || undefined,
    items: [
      {
        inventoryItemId: data.inventoryItemId,
        quantity: Number(data.quantity),
        unit: data.unit,
        storageLocationId: data.storageLocationId || undefined
      }
    ]
  };

  await withSubmitState(form, async () => {
    await postJson("/goods-receipts", body, "Wareneingang gebucht.");
    form.reset();
    await Promise.allSettled([loadMasterData(), loadGoodsReceipts()]);
  });
}

async function submitWithdrawal(event) {
  event.preventDefault();
  const form = event.target;
  clearFormErrors(form);
  if (!validateRequired(form) || !validateWithdrawalStock("#withdrawal-form", WarenwirtschaftApp.refs.withdrawalStockHint)) {
    return;
  }

  await withSubmitState(form, async () => {
    await postWithdrawal(form, "Entnahme gebucht.");
    form.reset();
    await loadMasterData();
  });
}

async function submitQuickBooking(event) {
  event.preventDefault();
  const form = event.target;
  clearFormErrors(form);
  if (!validateRequired(form) || !validateWithdrawalStock("#quick-booking-form", WarenwirtschaftApp.refs.quickBookingStockHint)) {
    return;
  }

  await withSubmitState(form, async () => {
    await postWithdrawal(form, "Schnellbuchung abgeschlossen.");
    form.reset();
    await loadMasterData();
  });
}

async function postWithdrawal(form, successMessage) {
  const data = formData(form);
  await postJson(
    "/withdrawals",
    {
      inventoryItemId: data.inventoryItemId,
      quantity: Number(data.quantity),
      unit: data.unit,
      storageLocationId: data.storageLocationId || undefined,
      note: data.reason || data.note || undefined
    },
    successMessage
  );
}

async function submitCorrection(event) {
  event.preventDefault();
  const form = event.target;
  clearFormErrors(form);
  if (!validateRequired(form)) {
    return;
  }

  const data = formData(form);
  await withSubmitState(form, async () => {
    await postJson(
      "/correction-requests",
      {
        inventoryItemId: data.inventoryItemId,
        expectedDelta: Number(data.expectedDelta),
        unit: data.unit,
        reason: data.reason
      },
      "Korrektur beantragt. Prüfaufgabe wurde angelegt."
    );
    form.reset();
    await Promise.allSettled([loadMasterData(), canUseAdminReviewTasks() ? loadReviewTasks() : Promise.resolve()]);
  });
}

async function postJson(path, body, successMessage) {
  await apiFetch(path, {
    method: "POST",
    body: JSON.stringify(body)
  });
  showToast(successMessage);
}

async function submitTaskAction(id, action) {
  try {
    await apiFetch(`/admin/review-tasks/${id}/${action}`, {
      method: "POST"
    });
    showToast("Prüfaufgabe aktualisiert.");
    await loadReviewTasks();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function withSubmitState(form, callback) {
  const button = form.querySelector("button[type='submit']");
  await withButtonState(button, callback);
}

async function withButtonState(button, callback) {
  const original = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = "Bitte warten...";
  }

  try {
    await callback();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = original;
    }
  }
}

function validateRequired(form) {
  let valid = true;
  form.querySelectorAll("[required]").forEach((field) => {
    if (!field.value) {
      setFieldError(form, field.name, "Bitte ausfüllen.");
      valid = false;
    }
  });

  if (!valid) {
    showToast("Bitte Formularfelder prüfen.", true);
  }

  return valid;
}

function setFieldError(form, name, message) {
  const error = form.querySelector(`[data-error-for="${name}"]`);
  if (error) {
    error.textContent = message;
  }
}

function clearFieldError(form, name) {
  setFieldError(form, name, "");
}

function clearFormErrors(form) {
  form.querySelectorAll(".field-error").forEach((element) => {
    element.textContent = "";
  });
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function normalizeFormValues(data) {
  const normalized = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === "") {
      continue;
    }
    normalized[key] = key === "minStock" ? Number(value) : value;
  }
  return normalized;
}

function renderTable(selector, headers, rows, mapRow, emptyMessage, retryAction) {
  const container = document.querySelector(selector);
  if (!rows.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>${escapeHtml(emptyMessage)}</p>
        <button data-action="${escapeHtml(retryAction)}">Erneut laden</button>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows
          .map((row) => `<tr>${mapRow(row).map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
          .join("")}
      </tbody>
    </table>
  `;

  container.querySelectorAll("[data-task-action]").forEach((button) => {
    button.addEventListener("click", () => submitTaskAction(button.dataset.taskId, button.dataset.taskAction));
  });
}

function findItem(id) {
  return WarenwirtschaftApp.state.masterData.items.find((item) => item.inventoryItemId === id);
}

function findStock(id) {
  return WarenwirtschaftApp.state.masterData.stock.find((item) => item.inventoryItemId === id);
}

function findOrder(id) {
  return WarenwirtschaftApp.state.masterData.openPurchaseOrders.find((order) => order.purchaseOrderId === id);
}

function canUseAdminReviewTasks() {
  return WarenwirtschaftApp.state.actorRole === "admin";
}

function statusBadge(label, className = "") {
  return `<span class="badge ${className}">${escapeHtml(String(label))}</span>`;
}

function showToast(message, isError = false) {
  WarenwirtschaftApp.refs.toast.textContent = message;
  WarenwirtschaftApp.refs.toast.hidden = false;
  WarenwirtschaftApp.refs.toast.classList.toggle("is-error", isError);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

window.WarenwirtschaftApp = WarenwirtschaftApp;
window.renderMasterDataControls = renderMasterDataControls;
window.validateWithdrawalStock = validateWithdrawalStock;
