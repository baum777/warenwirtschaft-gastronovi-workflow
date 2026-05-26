const WarenwirtschaftApp = {
  state: {
    apiBase: localStorage.getItem("ww.apiBase") || "http://localhost:3000",
    actorId: localStorage.getItem("ww.actorId") || "admin-1",
    actorRole: localStorage.getItem("ww.actorRole") || "admin"
  },
  refs: {}
};

const columns = {
  items: ["Name", "SKU", "Kategorie", "Einheit", "Min", "Status"],
  stock: ["Artikel", "Kategorie", "Bestand", "Einheit", "Status", "Letzte Bewegung"],
  orders: ["ID", "Status", "Lieferant", "Positionen"],
  receipts: ["ID", "Bestellung", "Empfangen von", "Positionen"],
  tasks: ["Typ", "Status", "Schwere", "Titel", "Aktion"]
};

document.addEventListener("DOMContentLoaded", () => {
  cacheRefs();
  bindNavigation();
  bindActorForm();
  bindForms();
  bindActions();
  syncActorForm();
  refreshDashboard();
});

function cacheRefs() {
  WarenwirtschaftApp.refs = {
    title: document.querySelector("#view-title"),
    toast: document.querySelector("#toast"),
    apiBase: document.querySelector("#api-base"),
    actorId: document.querySelector("#actor-id"),
    actorRole: document.querySelector("#actor-role")
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

function bindActorForm() {
  document.querySelector("#actor-form").addEventListener("submit", (event) => {
    event.preventDefault();
    WarenwirtschaftApp.state.apiBase = WarenwirtschaftApp.refs.apiBase.value.trim();
    WarenwirtschaftApp.state.actorId = WarenwirtschaftApp.refs.actorId.value.trim();
    WarenwirtschaftApp.state.actorRole = WarenwirtschaftApp.refs.actorRole.value;
    localStorage.setItem("ww.apiBase", WarenwirtschaftApp.state.apiBase);
    localStorage.setItem("ww.actorId", WarenwirtschaftApp.state.actorId);
    localStorage.setItem("ww.actorRole", WarenwirtschaftApp.state.actorRole);
    showToast("Actor-Kontext gespeichert.");
  });
}

function bindForms() {
  document.querySelector("#item-form").addEventListener("submit", submitItem);
  document.querySelector("#purchase-order-form").addEventListener("submit", submitPurchaseOrder);
  document.querySelector("#goods-receipt-form").addEventListener("submit", submitGoodsReceipt);
  document.querySelector("#withdrawal-form").addEventListener("submit", submitWithdrawal);
  document.querySelector("#correction-form").addEventListener("submit", submitCorrection);
}

function bindActions() {
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => runAction(button.dataset.action));
  });
}

function syncActorForm() {
  WarenwirtschaftApp.refs.apiBase.value = WarenwirtschaftApp.state.apiBase;
  WarenwirtschaftApp.refs.actorId.value = WarenwirtschaftApp.state.actorId;
  WarenwirtschaftApp.refs.actorRole.value = WarenwirtschaftApp.state.actorRole;
}

function showView(viewName) {
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
  const response = await fetch(`${WarenwirtschaftApp.state.apiBase}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-actor-id": WarenwirtschaftApp.state.actorId,
      "x-actor-role": WarenwirtschaftApp.state.actorRole,
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.message || `HTTP ${response.status}`);
  }

  return payload;
}

async function refreshDashboard() {
  await Promise.allSettled([loadItems(), loadStock(), loadReviewTasks()]);
}

async function runAction(action) {
  try {
    if (action === "refresh-all") {
      await refreshDashboard();
    }
    if (action === "load-items") {
      await loadItems();
    }
    if (action === "load-stock") {
      await loadStock();
    }
    if (action === "load-purchase-orders") {
      await loadPurchaseOrders();
    }
    if (action === "load-goods-receipts") {
      await loadGoodsReceipts();
    }
    if (action === "load-review-tasks") {
      await loadReviewTasks();
    }
  } catch (error) {
    showToast(error.message, true);
  }
}

async function loadItems() {
  const payload = await apiFetch("/admin/inventory/items");
  document.querySelector("#metric-items").textContent = payload.items.length;
  renderTable("#items-table", columns.items, payload.items, (item) => [
    item.name,
    item.sku || "-",
    item.category || "-",
    item.defaultUnit,
    item.minStock ?? "-",
    statusBadge(item.isActive ? "aktiv" : "inaktiv", item.isActive ? "" : "is-warning")
  ]);
}

async function loadStock() {
  const payload = await apiFetch("/admin/inventory/stock");
  const alerts = payload.items.filter((item) => item.status === "low" || item.status === "negative");
  document.querySelector("#metric-alerts").textContent = alerts.length;
  renderTable("#stock-table", columns.stock, payload.items, (item) => [
    item.name,
    item.category || "-",
    item.currentStock,
    item.unit,
    statusBadge(item.status, item.status === "negative" ? "is-danger" : item.status === "low" ? "is-warning" : ""),
    item.lastMovementAt || "-"
  ]);
}

async function loadPurchaseOrders() {
  const payload = await apiFetch("/admin/purchase-orders");
  renderTable("#purchase-orders-table", columns.orders, payload.purchaseOrders, (order) => [
    order.purchaseOrderId,
    statusBadge(order.status),
    order.supplierName || order.supplierId || "-",
    order.items.map((item) => `${item.inventoryItemName || item.inventoryItemId}: ${item.pendingQty} ${item.unit}`).join(", ")
  ]);
}

async function loadGoodsReceipts() {
  const payload = await apiFetch("/goods-receipts");
  renderTable("#goods-receipts-table", columns.receipts, payload.goodsReceipts, (receipt) => [
    receipt.goodsReceiptId,
    receipt.purchaseOrderId || "-",
    receipt.receivedById,
    receipt.items.map((item) => `${item.inventoryItemName || item.inventoryItemId}: ${item.quantity} ${item.unit}`).join(", ")
  ]);
}

async function loadReviewTasks() {
  const payload = await apiFetch("/admin/review-tasks");
  document.querySelector("#metric-tasks").textContent = payload.tasks.length;
  renderReviewTasks("#review-tasks-table", payload.tasks);
  renderReviewTasks("#dashboard-review-table", payload.tasks.slice(0, 5));
}

function renderReviewTasks(selector, tasks) {
  renderTable(selector, columns.tasks, tasks, (task) => [
    task.type,
    statusBadge(task.status, task.status === "open" ? "is-warning" : ""),
    task.severity,
    task.title,
    actionButtons(task.id)
  ]);
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

async function submitItem(event) {
  event.preventDefault();
  await submitJson(event.target, "/admin/inventory/items", "Artikel angelegt.");
  await loadItems();
}

async function submitPurchaseOrder(event) {
  event.preventDefault();
  const data = formData(event.target);
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
  await postJson("/admin/purchase-orders", body, "Bestellung angelegt.");
  await loadPurchaseOrders();
}

async function submitGoodsReceipt(event) {
  event.preventDefault();
  const data = formData(event.target);
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
  await postJson("/goods-receipts", body, "Wareneingang gebucht.");
  await Promise.allSettled([loadGoodsReceipts(), loadStock()]);
}

async function submitWithdrawal(event) {
  event.preventDefault();
  const data = formData(event.target);
  await postJson(
    "/withdrawals",
    {
      inventoryItemId: data.inventoryItemId,
      quantity: Number(data.quantity),
      unit: data.unit,
      storageLocationId: data.storageLocationId || undefined,
      note: data.note || undefined
    },
    "Entnahme erfasst."
  );
  await loadStock();
}

async function submitCorrection(event) {
  event.preventDefault();
  const data = formData(event.target);
  await postJson(
    "/correction-requests",
    {
      inventoryItemId: data.inventoryItemId,
      expectedDelta: Number(data.expectedDelta),
      unit: data.unit,
      reason: data.reason
    },
    "Korrektur beantragt."
  );
  await loadReviewTasks();
}

async function submitJson(form, path, successMessage) {
  await postJson(path, normalizeFormValues(formData(form)), successMessage);
  form.reset();
}

async function postJson(path, body, successMessage) {
  await apiFetch(path, {
    method: "POST",
    body: JSON.stringify(body)
  });
  showToast(successMessage);
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

function renderTable(selector, headers, rows, mapRow) {
  const container = document.querySelector(selector);
  if (!rows.length) {
    container.innerHTML = '<p class="empty-state">Keine Einträge</p>';
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

async function submitTaskAction(id, action) {
  try {
    await apiFetch(`/admin/review-tasks/${id}/${action}`, {
      method: "POST"
    });
    showToast("Review Task aktualisiert.");
    await loadReviewTasks();
  } catch (error) {
    showToast(error.message, true);
  }
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
