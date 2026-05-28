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
    activeWorkspace: null,
    activeWorkspaceTab: null,
    activeWorkspaceFilter: null,
    lastWorkspaceTrigger: null,
    lastQuickBooking: null,
    masterData: {
      suppliers: [],
      storageLocations: [],
      items: [],
      stock: [],
      purchaseOrders: [],
      openPurchaseOrders: [],
      goodsReceipts: [],
      reviewTasks: []
    },
    lastUpdatedAt: null
  },
  refs: {}
};

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

const columns = {
  items: ["Name", "SKU", "Kategorie", "Einheit", "Min", "Status"],
  stock: ["Artikel", "Kategorie", "Bestand", "Einheit", "Status", "Letzte Bewegung"],
  orders: ["ID", "Status", "Lieferant", "Positionen", "Aktion"],
  receipts: ["ID", "Bestellung", "Empfangen von", "Positionen"],
  tasks: ["Typ", "Status", "Schwere", "Titel", "Aktion"]
};

const emptyStates = {
  items:
    "Noch keine Artikel vorhanden. Lege den ersten Artikel an, damit Bestand, Bestellungen und Buchungen möglich werden.",
  stock:
    "Noch keine Bestandsbewegungen vorhanden. Buche einen Wareneingang oder lege Startbestände über Korrekturen an.",
  criticalStock: "Keine kritischen Bestände. Alle Artikel liegen aktuell über Mindestbestand.",
  purchaseOrders:
    "Keine offenen Bestellungen. Erfasse eine neue Bestellung oder prüfe, ob alle Lieferungen bereits gebucht wurden.",
  goodsReceipts:
    "Noch keine Wareneingänge gebucht. Wähle eine offene Bestellung oder buche einen freien Wareneingang.",
  reviewTasks: "Keine offenen Prüfaufgaben. Korrekturen und Auffälligkeiten erscheinen hier."
};

const workspaces = {
  items: {
    title: "Artikel",
    roles: ["admin"],
    tabs: [
      { name: "create", label: "Anlegen" },
      { name: "stock", label: "Bestand", load: loadItems }
    ],
    load: loadItems
  },
  stock: {
    title: "Bestand",
    roles: ["admin", "shift_lead", "staff"],
    tabs: [
      { name: "live", label: "Live Bestand", load: loadStock },
      { name: "critical", label: "Kritisch", filter: "critical", load: loadStock }
    ],
    load: loadStock
  },
  "purchase-orders": {
    title: "Bestellungen",
    roles: ["admin", "shift_lead"],
    tabs: [
      { name: "create", label: "Erfassen" },
      { name: "open", label: "Offen", load: loadPurchaseOrders }
    ],
    load: loadPurchaseOrders
  },
  "goods-receipts": {
    title: "Wareneingang",
    roles: ["admin", "shift_lead"],
    tabs: [
      { name: "book", label: "Buchen" },
      { name: "receipts", label: "Verlauf", load: loadGoodsReceipts }
    ],
    load: loadGoodsReceipts
  },
  withdrawals: {
    title: "Entnahmen",
    roles: ["admin", "shift_lead", "staff"],
    tabs: [{ name: "book", label: "Buchen" }]
  },
  "quick-booking": {
    title: "Schnellbuchen",
    roles: ["admin", "shift_lead", "staff"],
    tabs: [{ name: "book", label: "Sofort buchen" }]
  },
  corrections: {
    title: "Korrekturen",
    roles: ["admin", "shift_lead", "staff"],
    tabs: [{ name: "request", label: "Beantragen" }]
  },
  "review-tasks": {
    title: "Prüfung",
    roles: ["admin"],
    tabs: [{ name: "tasks", label: "Offen", load: loadReviewTasks }],
    load: loadReviewTasks
  }
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
  bindWorkspaceShell();
  bindReasonChips();

  await loadAppContext();
  applyAppContext();
  syncDevForm();
  updateWorkspaceAccess();
  await refreshDashboard();
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
    quickBookingStockHint: document.querySelector("#quick-booking-stock-hint"),
    overlay: document.querySelector("#workspace-overlay"),
    backdrop: document.querySelector("#workspace-backdrop"),
    workspaceTitle: document.querySelector("#workspace-title"),
    workspaceContext: document.querySelector("#workspace-context"),
    workspaceTabs: document.querySelector("#workspace-tabs"),
    workspaceBody: document.querySelector("#workspace-body"),
    quickBookingResult: document.querySelector("#quick-booking-result")
  };
}

function bindNavigation() {
  document.querySelectorAll("[data-view], [data-view-link], [data-workspace]").forEach((element) => {
    element.addEventListener("click", () => {
      const view = element.dataset.view || element.dataset.viewLink;
      const workspace = element.dataset.workspace;

      if (workspace) {
        openWorkspace(workspace, {
          tab: element.dataset.workspaceTab,
          filter: element.dataset.workspaceFilter,
          trigger: element
        });
        return;
      }
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
    updateWorkspaceAccess();

    if (WarenwirtschaftApp.state.activeWorkspace && !canOpenWorkspace(WarenwirtschaftApp.state.activeWorkspace)) {
      closeWorkspace();
    }

    showToast("Actor-Kontext gespeichert.");
    await refreshDashboard();
  });
}

function bindForms() {
  document.querySelector("#item-form").addEventListener("submit", submitItem);
  document.querySelector("#purchase-order-form").addEventListener("submit", submitPurchaseOrder);
  document.querySelector("#goods-receipt-form").addEventListener("submit", submitGoodsReceipt);
  document.querySelector("#withdrawal-form").addEventListener("submit", submitWithdrawal);
  document.querySelector("#quick-booking-form").addEventListener("submit", submitQuickBook);
  document.querySelector("#correction-form").addEventListener("submit", submitCorrection);
}

function bindActions() {
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => runAction(button.dataset.action));
  });
}

function bindWorkspaceShell() {
  WarenwirtschaftApp.refs.backdrop.addEventListener("click", closeWorkspace);
  WarenwirtschaftApp.refs.workspaceTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-workspace-tab]");
    if (button) {
      setWorkspaceTab(button.dataset.workspaceTab);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && WarenwirtschaftApp.state.activeWorkspace) {
      closeWorkspace();
    }
  });
}

function bindReasonChips() {
  document.querySelectorAll("[data-reason-chip]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const form = document.querySelector("#quick-booking-form");
      const select = form.elements.reason;
      select.value = chip.dataset.reasonChip;
      updateReasonChips(select.value);
    });
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
  document.querySelector("#quick-booking-form [name='movementType']").addEventListener("change", () => {
    validateWithdrawalStock("#quick-booking-form", WarenwirtschaftApp.refs.quickBookingStockHint);
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

function showView(viewName) {
  if (viewName === "dashboard") {
    closeWorkspace();
  } else {
    openWorkspace(viewName);
  }
}

function openWorkspace(workspaceName, options = {}) {
  const normalizedWorkspaceName = normalizeWorkspaceName(workspaceName);
  const workspace = workspaces[normalizedWorkspaceName];
  if (!workspace) {
    return false;
  }

  if (!canOpenWorkspace(normalizedWorkspaceName)) {
    showToast("Keine Berechtigung für diesen Arbeitsbereich.", true);
    return false;
  }

  const requestedTab = options.tab || (options.filter === "critical" ? "critical" : workspace.tabs[0].name);
  const nextTab = workspace.tabs.some((tab) => tab.name === requestedTab) ? requestedTab : workspace.tabs[0].name;
  WarenwirtschaftApp.state.activeWorkspace = normalizedWorkspaceName;
  WarenwirtschaftApp.state.activeWorkspaceTab = nextTab;
  WarenwirtschaftApp.state.activeWorkspaceFilter =
    options.filter || workspace.tabs.find((tab) => tab.name === nextTab)?.filter || null;
  WarenwirtschaftApp.state.lastWorkspaceTrigger = options.trigger || null;
  WarenwirtschaftApp.refs.overlay.hidden = false;
  WarenwirtschaftApp.refs.overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-workspace-open");
  renderWorkspaceShell(normalizedWorkspaceName);
  updateWorkspaceNavigation();
  loadWorkspace(normalizedWorkspaceName);
  document.querySelector("[data-action='close-workspace']").focus();
  return true;
}

function closeWorkspace() {
  const trigger = WarenwirtschaftApp.state.lastWorkspaceTrigger;
  WarenwirtschaftApp.state.activeWorkspace = null;
  WarenwirtschaftApp.state.activeWorkspaceTab = null;
  WarenwirtschaftApp.state.activeWorkspaceFilter = null;
  WarenwirtschaftApp.state.lastWorkspaceTrigger = null;

  if (WarenwirtschaftApp.refs.overlay) {
    WarenwirtschaftApp.refs.overlay.hidden = true;
    WarenwirtschaftApp.refs.overlay.setAttribute("aria-hidden", "true");
  }

  document.body.classList.remove("has-workspace-open");
  document.querySelectorAll(".workspace-view, [data-workspace-tab-panel]").forEach((element) => {
    element.classList.remove("is-active");
  });
  updateWorkspaceNavigation();
  WarenwirtschaftApp.refs.title.textContent = "Übersicht";

  if (trigger && trigger.isConnected) {
    trigger.focus();
  }
}

function setWorkspaceTab(tabName) {
  const workspaceName = WarenwirtschaftApp.state.activeWorkspace;
  const workspace = workspaces[workspaceName];
  if (!workspace || !workspace.tabs.some((tab) => tab.name === tabName)) {
    return false;
  }

  const tab = workspace.tabs.find((candidate) => candidate.name === tabName);
  WarenwirtschaftApp.state.activeWorkspaceTab = tabName;
  setWorkspaceFilter(tab.filter || null);
  renderWorkspaceShell(workspaceName);

  if (tab.load) {
    tab.load().catch((error) => showToast(error.message, true));
  }

  return true;
}

function setWorkspaceFilter(filterName) {
  WarenwirtschaftApp.state.activeWorkspaceFilter = filterName || null;
  return true;
}

function renderWorkspaceShell(workspaceName) {
  const workspace = workspaces[workspaceName];
  WarenwirtschaftApp.refs.workspaceTitle.textContent = workspace.title;
  renderWorkspaceContext(workspaceName);

  WarenwirtschaftApp.refs.workspaceTabs.hidden = workspace.tabs.length <= 1;
  WarenwirtschaftApp.refs.workspaceTabs.innerHTML = workspace.tabs
    .map(
      (tab) => `
        <button
          type="button"
          role="tab"
          class="workspace-tab ${tab.name === WarenwirtschaftApp.state.activeWorkspaceTab ? "is-active" : ""}"
          aria-selected="${tab.name === WarenwirtschaftApp.state.activeWorkspaceTab ? "true" : "false"}"
          data-workspace-tab="${escapeHtml(tab.name)}"
        >
          ${escapeHtml(tab.label)}
        </button>
      `
    )
    .join("");

  document.querySelectorAll(".workspace-view").forEach((view) => {
    const isActiveWorkspace = view.dataset.workspace === workspaceName;
    view.classList.toggle("is-active", isActiveWorkspace);
    view.querySelectorAll("[data-workspace-tab-panel]").forEach((panel) => {
      panel.classList.toggle(
        "is-active",
        isActiveWorkspace && panel.dataset.workspaceTabPanel === WarenwirtschaftApp.state.activeWorkspaceTab
      );
    });
  });

  document.body.classList.toggle("has-critical-filter", WarenwirtschaftApp.state.activeWorkspaceFilter === "critical");
}

function renderWorkspaceContext(workspaceName) {
  const data = WarenwirtschaftApp.state.masterData;
  const criticalCount = getCriticalStockRows().length;
  const openOrders = getOpenPurchaseOrders();
  const context = {
    items: "Artikelstammdaten, Einheiten, Mindestbestand und Lagerort",
    stock: `${data.stock.length} Artikel · ${criticalCount} kritisch · letzte Aktualisierung lokal`,
    "purchase-orders": `${openOrders.length} offene Bestellungen · Lieferantenbestellungen erfassen und verfolgen`,
    "goods-receipts": `${openOrders.length} offene Bestellungen · Wareneingänge erhöhen den Bestand automatisch`,
    withdrawals: "Entnahmen reduzieren den Bestand · Bestand wird vor Buchung geprüft",
    "quick-booking": "Für Touch-Bedienung optimiert · ideal für Küche/Bar",
    corrections: "Korrekturen erzeugen Prüfaufgaben und ändern Bestand nicht sofort",
    "review-tasks": `${data.reviewTasks.length} offene Prüfaufgaben · nur Admin`
  };
  WarenwirtschaftApp.refs.workspaceContext.textContent = context[workspaceName] || "";
}

function updateWorkspaceNavigation() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    const isDashboard = item.dataset.view === "dashboard";
    const isActiveWorkspace = normalizeWorkspaceName(item.dataset.workspace) === WarenwirtschaftApp.state.activeWorkspace;
    item.classList.toggle("is-active", isDashboard ? !WarenwirtschaftApp.state.activeWorkspace : isActiveWorkspace);
  });
}

function updateWorkspaceAccess() {
  document.querySelectorAll("[data-workspace]").forEach((element) => {
    const isAllowed = canOpenWorkspace(element.dataset.workspace);
    element.disabled = !isAllowed;
    element.setAttribute("aria-disabled", String(!isAllowed));

    if (element.matches("[data-dashboard-card]")) {
      element.hidden = !isAllowed;
    }
  });
  updateWorkspaceNavigation();
}

function canOpenWorkspace(workspaceName) {
  const workspace = workspaces[normalizeWorkspaceName(workspaceName)];
  return Boolean(workspace && workspace.roles.includes(WarenwirtschaftApp.state.actorRole));
}

function normalizeWorkspaceName(workspaceName) {
  const aliases = {
    "quick-book": "quick-booking",
    quickbook: "quick-booking",
    schnellbuchen: "quick-booking",
    bestand: "stock",
    bestellungen: "purchase-orders",
    wareneingang: "goods-receipts",
    entnahmen: "withdrawals",
    korrekturen: "corrections",
    pruefung: "review-tasks",
    prüfung: "review-tasks",
    review: "review-tasks"
  };

  const normalized = String(workspaceName || "")
    .trim()
    .toLowerCase();

  return aliases[normalized] || normalized;
}

function loadWorkspace(workspaceName) {
  const workspace = workspaces[workspaceName];
  if (!workspace || !workspace.load) {
    renderWorkspaceContext(workspaceName);
    return Promise.resolve();
  }

  return workspace.load().catch((error) => showToast(error.message, true));
}

async function apiFetch(path, options = {}) {
  const { includeActor = true, ...fetchOptions } = options;
  const response = await fetch(`${WarenwirtschaftApp.state.apiBase}${path}`, {
    ...fetchOptions,
    headers: {
      "content-type": "application/json",
      ...(includeActor
        ? {
            "x-actor-id": WarenwirtschaftApp.state.actorId,
            "x-actor-role": WarenwirtschaftApp.state.actorRole
          }
        : {}),
      ...(fetchOptions.headers || {})
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
  const results = await Promise.allSettled([
    loadMasterData(),
    canOpenWorkspace("goods-receipts") ? loadGoodsReceipts() : Promise.resolve(),
    canOpenWorkspace("review-tasks") ? loadReviewTasks() : Promise.resolve()
  ]);
  const failed = results.find((result) => result.status === "rejected");

  if (failed?.status === "rejected") {
    showToast(failed.reason.message, true);
  }
}

async function runAction(action) {
  try {
    if (action === "close-workspace") {
      closeWorkspace();
    }
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

async function loadMasterData() {
  const data = await apiFetch("/inventory/master-data");
  WarenwirtschaftApp.state.masterData = {
    ...WarenwirtschaftApp.state.masterData,
    ...data,
    purchaseOrders: data.openPurchaseOrders || data.purchaseOrders || [],
    reviewTasks: WarenwirtschaftApp.state.masterData.reviewTasks,
    goodsReceipts: WarenwirtschaftApp.state.masterData.goodsReceipts
  };
  markUpdated();
  renderMasterDataControls();
  renderItems();
  renderStockViews();
  renderPurchaseOrders();
  renderActiveWorkspaceContext();
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
  fillSelect("#quick-booking-location", data.storageLocations, "storageLocationId", "name", "Kein Lagerort");
  syncWithdrawalDefaults("#withdrawal-form", WarenwirtschaftApp.refs.withdrawalStockHint);
  syncWithdrawalDefaults("#quick-booking-form", WarenwirtschaftApp.refs.quickBookingStockHint);
}

function fillSelect(selector, rows, valueKey, label, emptyLabel) {
  const select = document.querySelector(selector);
  if (!select) {
    return;
  }

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
  if (form.elements.storageLocationId) {
    form.elements.storageLocationId.value = item.storageLocationId || "";
  }
}

function syncWithdrawalDefaults(formSelector, hint) {
  const form = document.querySelector(formSelector);
  const item = findItem(form.elements.inventoryItemId.value);

  if (item) {
    if (form.elements.unit) {
      form.elements.unit.value = item.defaultUnit;
    }
    if (form.elements.storageLocationId) {
      form.elements.storageLocationId.value = item.storageLocationId || "";
    }
  } else if (form.elements.storageLocationId) {
    form.elements.storageLocationId.value = "";
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

  if (!itemId) {
    hint.textContent = "Bestand wird nach Artikelauswahl angezeigt.";
    return true;
  }

  if (!stock) {
    hint.textContent = "Für diesen Artikel liegt noch kein Bestand vor.";
    return true;
  }

  hint.textContent = `Verfügbar: ${stock.currentStock} ${stock.unit}`;

  if (form.elements.movementType?.value === "goods-receipt") {
    hint.textContent = `Aktueller Bestand: ${stock.currentStock} ${stock.unit}. Wareneingang erhöht den Bestand.`;
    return true;
  }

  if (quantity > stock.currentStock) {
    const message = `Maximal verfügbar: ${stock.currentStock} ${stock.unit}.`;
    quantityInput.setCustomValidity(message);
    setFieldError(form, "quantity", message);
    return false;
  }

  return true;
}

async function loadItems() {
  if (!WarenwirtschaftApp.state.masterData.items.length) {
    await loadMasterData();
    return;
  }

  renderItems();
  renderActiveWorkspaceContext();
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
    statusBadge(item.isActive ? "aktiv" : "inaktiv", item.isActive ? "" : "is-warning")
  ], emptyStates.items);
}

async function loadStock() {
  if (!WarenwirtschaftApp.state.masterData.stock.length) {
    await loadMasterData();
    return;
  }

  renderStockViews();
  renderActiveWorkspaceContext();
}

function renderStockViews() {
  const stockRows = WarenwirtschaftApp.state.masterData.stock;
  const criticalRows = getCriticalStockRows();
  document.querySelector("#metric-alerts").textContent = criticalRows.length;
  renderStockTable("#stock-table", stockRows, emptyStates.stock);
  renderStockTable("#critical-stock-table", criticalRows, emptyStates.criticalStock);
}

function renderStockTable(selector, rows, emptyMessage) {
  renderTable(selector, columns.stock, rows, (item) => [
    item.name,
    item.category || "-",
    item.currentStock,
    item.unit,
    statusBadge(item.status, item.status === "negative" ? "is-danger" : item.status === "low" ? "is-warning" : ""),
    item.lastMovementAt || "-"
  ], emptyMessage);
}

async function loadPurchaseOrders() {
  if (!WarenwirtschaftApp.state.masterData.purchaseOrders.length) {
    await loadMasterData();
    return;
  }

  renderPurchaseOrders();
  renderActiveWorkspaceContext();
}

function renderPurchaseOrders() {
  renderTable("#purchase-orders-table", columns.orders, getOpenPurchaseOrders(), (order) => [
    order.purchaseOrderId,
    statusBadge(order.status),
    order.supplierName || order.supplierId || "-",
    order.items.map((item) => `${item.inventoryItemName || item.inventoryItemId}: ${item.pendingQty} ${item.unit}`).join(", "),
    purchaseOrderActions(order)
  ], emptyStates.purchaseOrders);
}

function purchaseOrderActions(order) {
  if (order.status !== "draft") {
    return "-";
  }

  return `
    <span class="row-actions">
      <button data-order-action="mark-ordered" data-order-id="${escapeHtml(order.purchaseOrderId)}">Bestellt</button>
    </span>
  `;
}

async function loadGoodsReceipts() {
  const payload = await apiFetch("/goods-receipts");
  WarenwirtschaftApp.state.masterData.goodsReceipts = payload.goodsReceipts;
  markUpdated();
  renderTable("#goods-receipts-table", columns.receipts, payload.goodsReceipts, (receipt) => [
    receipt.goodsReceiptId,
    receipt.purchaseOrderId || "-",
    receipt.receivedById,
    receipt.items.map((item) => `${item.inventoryItemName || item.inventoryItemId}: ${item.quantity} ${item.unit}`).join(", ")
  ], emptyStates.goodsReceipts);
  renderActiveWorkspaceContext();
}

async function loadReviewTasks() {
  const payload = await apiFetch("/admin/review-tasks");
  WarenwirtschaftApp.state.masterData.reviewTasks = payload.tasks;
  markUpdated();
  document.querySelector("#metric-tasks").textContent = payload.tasks.length;
  renderReviewTasks("#review-tasks-table", payload.tasks);
  renderReviewTasks("#dashboard-review-table", payload.tasks.slice(0, 5));
  renderActiveWorkspaceContext();
}

function renderReviewTasks(selector, tasks) {
  renderTable(selector, columns.tasks, tasks, (task) => [
    task.type,
    statusBadge(task.status, task.status === "open" ? "is-warning" : ""),
    task.severity,
    task.title,
    actionButtons(task.id)
  ], emptyStates.reviewTasks);
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
  await loadMasterData();
  setWorkspaceTab("stock");
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
  await loadMasterData();
  setWorkspaceTab("open");
}

async function submitGoodsReceipt(event) {
  event.preventDefault();
  const data = formData(event.target);
  await createGoodsReceipt(data, "Wareneingang gebucht.");
  await Promise.allSettled([loadGoodsReceipts(), loadMasterData()]);
  setWorkspaceTab("receipts");
}

async function submitWithdrawal(event) {
  event.preventDefault();
  const data = formData(event.target);
  await createWithdrawal(data, "Entnahme erfasst.");
  await loadMasterData();
}

async function submitQuickBook(event) {
  event.preventDefault();
  const form = event.target;
  const data = formData(form);

  if (data.movementType === "goods-receipt") {
    await createGoodsReceipt(data, "Wareneingang gebucht.");
    await Promise.allSettled([loadGoodsReceipts(), loadMasterData()]);
  } else {
    await createWithdrawal(data, "Entnahme erfasst.");
    await loadMasterData();
  }

  WarenwirtschaftApp.state.lastQuickBooking = {
    quantity: data.quantity,
    unit: data.unit,
    inventoryItemId: data.inventoryItemId,
    reason: data.reason || data.note || "-"
  };
  renderLastQuickBooking();
  form.reset();
  form.elements.reason.value = "Verbrauch Küche";
  updateReasonChips("Verbrauch Küche");
  form.elements.inventoryItemId.focus();
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
  await refreshReviewTasksIfAllowed();
}

async function createGoodsReceipt(data, successMessage) {
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
  await postJson("/goods-receipts", body, successMessage);
}

async function createWithdrawal(data, successMessage) {
  await postJson(
    "/withdrawals",
    {
      inventoryItemId: data.inventoryItemId,
      quantity: Number(data.quantity),
      unit: data.unit,
      storageLocationId: data.storageLocationId || undefined,
      note: data.note || data.reason || undefined
    },
    successMessage
  );
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

function refreshStockIfAllowed() {
  if (!canOpenWorkspace("stock")) {
    return Promise.resolve();
  }

  return loadMasterData();
}

function refreshReviewTasksIfAllowed() {
  if (!canOpenWorkspace("review-tasks")) {
    return Promise.resolve();
  }

  return loadReviewTasks();
}

function getCriticalStockRows() {
  return WarenwirtschaftApp.state.masterData.stock.filter(
    (item) => item.status === "low" || item.status === "negative"
  );
}

function getOpenPurchaseOrders() {
  return WarenwirtschaftApp.state.masterData.purchaseOrders.filter(
    (order) => !["delivered", "complete", "completed", "cancelled", "canceled"].includes(String(order.status).toLowerCase())
  );
}

function renderActiveWorkspaceContext() {
  if (WarenwirtschaftApp.state.activeWorkspace) {
    renderWorkspaceContext(WarenwirtschaftApp.state.activeWorkspace);
  }
}

function markUpdated() {
  WarenwirtschaftApp.state.lastUpdatedAt = new Date();
}

function renderLastQuickBooking() {
  const booking = WarenwirtschaftApp.state.lastQuickBooking;
  if (!booking) {
    return;
  }

  WarenwirtschaftApp.refs.quickBookingResult.hidden = false;
  WarenwirtschaftApp.refs.quickBookingResult.textContent = `Zuletzt gebucht: ${booking.quantity} ${booking.unit} ${booking.inventoryItemId} · ${booking.reason}`;
}

function updateReasonChips(activeReason) {
  document.querySelectorAll("[data-reason-chip]").forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.reasonChip === activeReason);
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

function setFieldError(form, name, message) {
  const error = form.querySelector(`[data-error-for="${name}"]`);
  if (error) {
    error.textContent = message;
  }
}

function clearFieldError(form, name) {
  setFieldError(form, name, "");
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

function renderTable(selector, headers, rows, mapRow, emptyMessage = "Keine Einträge") {
  const container = document.querySelector(selector);
  if (!container) {
    return;
  }

  if (!rows.length) {
    container.innerHTML = `<p class="empty-state">${escapeHtml(container.dataset.emptyState || emptyMessage)}</p>`;
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
  container.querySelectorAll("[data-order-action]").forEach((button) => {
    button.addEventListener("click", () => submitPurchaseOrderAction(button.dataset.orderId, button.dataset.orderAction));
  });
}

async function submitPurchaseOrderAction(id, action) {
  try {
    if (action !== "mark-ordered") {
      return;
    }

    await apiFetch(`/admin/purchase-orders/${id}/mark-ordered`, {
      method: "POST",
      body: JSON.stringify({})
    });
    showToast("Bestellung als bestellt markiert.");
    await loadMasterData();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function submitTaskAction(id, action) {
  try {
    await apiFetch(`/admin/review-tasks/${id}/${action}`, {
      method: "POST",
      body: JSON.stringify({})
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

WarenwirtschaftApp.openWorkspace = openWorkspace;
WarenwirtschaftApp.closeWorkspace = closeWorkspace;
WarenwirtschaftApp.setWorkspaceTab = setWorkspaceTab;
WarenwirtschaftApp.setWorkspaceFilter = setWorkspaceFilter;
WarenwirtschaftApp.canOpenWorkspace = canOpenWorkspace;
WarenwirtschaftApp.getCriticalStockRows = getCriticalStockRows;
window.WarenwirtschaftApp = WarenwirtschaftApp;
