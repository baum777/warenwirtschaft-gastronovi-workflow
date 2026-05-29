const WarenwirtschaftApp = {
  state: {
    apiBase: localStorage.getItem("ww.apiBase") || defaultApiBase(),
    actorId: localStorage.getItem("ww.actorId") || "demo-admin",
    actorRole: localStorage.getItem("ww.actorRole") || "admin",
    currentLocation: localStorage.getItem("ww.currentLocation") || "Hauptlager",
    connectionStatus: navigator.onLine ? "online" : "offline",
    ui: {
      isSidebarCollapsed: localStorage.getItem("ww.sidebarCollapsed") === "1",
      isSidebarOpenMobile: false
    },
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
    stockMovements: [],
    stockMovementsLoaded: false,
    stockUi: {
      filters: {
        status: "",
        location: "",
        category: "",
        search: ""
      },
      selectedInventoryItemId: null
    },
    reviewUi: {
      selectedTaskId: null
    },
    correctionReviewIndex: {},
    commandForms: {},
    dashboardMetrics: [],
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
  stock: ["Artikel", "Kategorie", "Bestand", "Einheit", "Status", "Letzte Bewegung", "Detail"],
  orders: ["ID", "Status", "Lieferant", "Positionen"],
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

const dashboardMetricFixtures = [
  {
    key: "stock-critical",
    label: "Bestand kritisch",
    description: "Artikel mit Status low oder negative",
    value: 8,
    tone: "warning",
    state: "value",
    workspace: "stock",
    tab: "critical",
    filter: "critical",
    roles: ["admin", "shift_lead"]
  },
  {
    key: "stock-negative",
    label: "Negative Bestände",
    description: "Artikel unter null Bestand",
    value: 2,
    tone: "danger",
    state: "value",
    workspace: "stock",
    tab: "live",
    filter: "negative",
    roles: ["admin", "shift_lead"]
  },
  {
    key: "review-open",
    label: "Offene Reviews",
    description: "ReviewTasks mit Status open",
    value: 5,
    tone: "warning",
    state: "value",
    workspace: "review-tasks",
    tab: "tasks",
    filter: "open",
    roles: ["admin"]
  },
  {
    key: "purchase-orders-open",
    label: "Offene Bestellungen",
    description: "Bestellungen ordered oder partially_received",
    value: 11,
    tone: "info",
    state: "value",
    workspace: "purchase-orders",
    tab: "open",
    filter: "open",
    roles: ["admin", "shift_lead"]
  },
  {
    key: "purchase-orders-partial",
    label: "Teillieferungen",
    description: "Bestellungen mit teilweiser Lieferung",
    tone: "warning",
    state: "loading",
    workspace: "purchase-orders",
    tab: "open",
    filter: "partially_received",
    roles: ["admin", "shift_lead"]
  },
  {
    key: "goods-receipts-today",
    label: "Wareneingänge heute",
    description: "Heute bestätigte Wareneingänge",
    tone: "info",
    state: "empty",
    workspace: "goods-receipts",
    tab: "receipts",
    filter: "today",
    roles: ["admin", "shift_lead"]
  },
  {
    key: "withdrawals-today",
    label: "Entnahmen heute",
    description: "Heute bestätigte Entnahmen",
    value: 34,
    tone: "info",
    state: "value",
    workspace: "withdrawals",
    tab: "book",
    filter: "today",
    roles: ["admin", "shift_lead"]
  },
  {
    key: "corrections-open",
    label: "Korrekturen offen",
    description: "CorrectionRequests mit Status pending",
    tone: "danger",
    state: "error",
    errorMessage: "Fixture-Quelle nicht erreichbar",
    workspace: "corrections",
    tab: "request",
    filter: "pending",
    roles: ["admin", "shift_lead"]
  },
  {
    key: "items-total",
    label: "Artikel gesamt",
    description: "Aktive Artikel im Sortiment",
    value: 126,
    tone: "ok",
    state: "value",
    workspace: "items",
    tab: "stock",
    roles: ["admin", "shift_lead"]
  }
];

const stockStatusPresentation = {
  unknown: { label: "Unbekannt", tone: "neutral", icon: "?" },
  ok: { label: "OK", tone: "ok", icon: "✓" },
  low: { label: "Niedrig", tone: "warning", icon: "⚠" },
  negative: { label: "Negativ", tone: "danger", icon: "!" }
};

const reviewSeverityPresentation = {
  low: { label: "Niedrig", tone: "info", icon: "i" },
  medium: { label: "Mittel", tone: "warning", icon: "⚠" },
  high: { label: "Hoch", tone: "danger", icon: "!" }
};

const reviewStatusPresentation = {
  open: { label: "Offen", tone: "warning", icon: "◔" },
  in_review: { label: "In Prüfung", tone: "info", icon: "◑" },
  resolved: { label: "Gelöst", tone: "ok", icon: "✓" },
  dismissed: { label: "Verworfen", tone: "neutral", icon: "–" }
};

const purchaseOrderStatusPresentation = {
  draft: { label: "Entwurf", tone: "neutral", icon: "•" },
  ordered: { label: "Bestellt", tone: "info", icon: "↗" },
  partially_received: { label: "Teillieferung", tone: "warning", icon: "◑" },
  received: { label: "Geliefert", tone: "ok", icon: "✓" },
  cancelled: { label: "Storniert", tone: "neutral", icon: "×" },
  closed_with_difference: { label: "Abgeschlossen (Diff.)", tone: "warning", icon: "!" }
};

const rolePresentation = {
  admin: "Admin",
  shift_lead: "Shift Lead",
  staff: "Staff"
};

const roleDefaultLocation = {
  admin: "Zentrallager",
  shift_lead: "Service-Lager",
  staff: "Küche"
};

const connectionPresentation = {
  online: { label: "Online", tone: "ok" },
  degraded: { label: "Eingeschränkt", tone: "warning" },
  offline: { label: "Offline", tone: "danger" }
};

const commandFormStatusLabel = {
  idle: "Bereit",
  filling: "Eingabe läuft",
  validating: "Eingaben prüfen",
  submitting: "Command wird gesendet",
  committed: "Command bestätigt",
  duplicate: "Bereits gebucht",
  rejected: "Nicht erlaubt",
  failed: "Command fehlgeschlagen"
};

const commandRequestTimeoutMs = 10000;

const navigationItems = [
  { id: "dashboard", label: "Übersicht", icon: "⌂", target: "view", view: "dashboard", roles: ["admin", "shift_lead"] },
  { id: "items", label: "Artikel", icon: "▦", target: "workspace", workspace: "items", roles: ["admin"] },
  { id: "stock", label: "Bestand", icon: "◫", target: "workspace", workspace: "stock", roles: ["admin", "shift_lead"] },
  {
    id: "purchase-orders",
    label: "Bestellungen",
    icon: "◎",
    target: "workspace",
    workspace: "purchase-orders",
    roles: ["admin", "shift_lead"]
  },
  {
    id: "goods-receipts",
    label: "Wareneingang",
    icon: "↥",
    target: "workspace",
    workspace: "goods-receipts",
    roles: ["admin", "shift_lead"]
  },
  { id: "withdrawals", label: "Entnahmen", icon: "↧", target: "workspace", workspace: "withdrawals", roles: ["admin", "shift_lead"] },
  { id: "quick-booking", label: "Schnellbuchen", icon: "⚡", target: "workspace", workspace: "quick-booking", roles: ["admin", "shift_lead", "staff"] },
  { id: "corrections", label: "Korrekturen", icon: "△", target: "workspace", workspace: "corrections", roles: ["admin", "shift_lead"] },
  { id: "review-tasks", label: "Prüfung", icon: "✓", target: "workspace", workspace: "review-tasks", roles: ["admin"] },
  { id: "staff-history", label: "Eigener Verlauf", icon: "◷", target: "workspace", workspace: "staff-history", roles: ["staff"] },
  { id: "staff-hints", label: "Hinweise", icon: "ⓘ", target: "workspace", workspace: "staff-hints", roles: ["staff"] }
];

const mobilePrimaryNavigationByRole = {
  admin: ["dashboard", "stock", "review-tasks"],
  shift_lead: ["dashboard", "stock", "quick-booking"],
  staff: ["quick-booking", "staff-history", "staff-hints"]
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
    roles: ["admin", "shift_lead"],
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
    roles: ["admin", "shift_lead"],
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
  },
  "staff-history": {
    title: "Eigener Verlauf",
    roles: ["staff"],
    tabs: [{ name: "timeline", label: "Verlauf" }]
  },
  "staff-hints": {
    title: "Hinweise",
    roles: ["staff"],
    tabs: [{ name: "tips", label: "Hinweise" }]
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
  bindCommandPrimitives();
  bindActions();
  bindMasterDataEvents();
  bindWorkspaceShell();
  bindReasonChips();
  bindStockWorkspaceEvents();
  bindReviewWorkspaceEvents();
  bindShellControls();
  bindConnectivityEvents();

  await loadAppContext();
  applyAppContext();
  applyRoleDefaults();
  renderRoleNavigation();
  syncDevForm();
  updateWorkspaceAccess();
  renderDashboardMetricCards();
  syncShellState();
  renderTopContextBar();
  ensureRoleLanding();
  await refreshDashboard();
}

function cacheRefs() {
  WarenwirtschaftApp.refs = {
    appShell: document.querySelector("#app"),
    sidebar: document.querySelector("#sidebar"),
    sidebarNav: document.querySelector("#sidebar-nav-list"),
    mobileNav: document.querySelector("#mobile-nav"),
    sidebarToggle: document.querySelector("#sidebar-toggle"),
    title: document.querySelector("#view-title"),
    contextRole: document.querySelector("#context-role"),
    contextLocation: document.querySelector("#context-location"),
    contextConnection: document.querySelector("#context-connection"),
    dashboardMetricGrid: document.querySelector("#dashboard-metric-grid"),
    stockFilterStatus: document.querySelector("#stock-filter-status"),
    stockFilterLocation: document.querySelector("#stock-filter-location"),
    stockFilterCategory: document.querySelector("#stock-filter-category"),
    stockFilterSearch: document.querySelector("#stock-filter-search"),
    stockCardList: document.querySelector("#stock-card-list"),
    criticalStockCardList: document.querySelector("#critical-stock-card-list"),
    stockDetailDrawer: document.querySelector("#stock-detail-drawer"),
    stockDetailTitle: document.querySelector("#stock-detail-title"),
    stockDetailMaster: document.querySelector("#stock-detail-master"),
    stockDetailSnapshot: document.querySelector("#stock-detail-snapshot"),
    stockDetailTimeline: document.querySelector("#stock-detail-timeline"),
    toastZone: document.querySelector("#toast-zone"),
    devPanel: document.querySelector("#dev-panel"),
    apiBase: document.querySelector("#api-base"),
    actorId: document.querySelector("#actor-id"),
    actorRole: document.querySelector("#actor-role"),
    metricItemsCard: document.querySelector("#metric-items-card"),
    metricAlertsCard: document.querySelector("#metric-alerts-card"),
    metricTasksCard: document.querySelector("#metric-tasks-card"),
    goodsReceiptMode: document.querySelector("#goods-receipt-mode"),
    goodsReceiptModeHint: document.querySelector("#goods-receipt-mode-hint"),
    withdrawalStockHint: document.querySelector("#withdrawal-stock-hint"),
    quickBookingStockHint: document.querySelector("#quick-booking-stock-hint"),
    overlay: document.querySelector("#workspace-overlay"),
    backdrop: document.querySelector("#workspace-backdrop"),
    workspaceTitle: document.querySelector("#workspace-title"),
    workspaceContext: document.querySelector("#workspace-context"),
    workspaceTabs: document.querySelector("#workspace-tabs"),
    workspaceBody: document.querySelector("#workspace-body"),
    quickBookingResult: document.querySelector("#quick-booking-result"),
    reviewTaskCardList: document.querySelector("#review-task-card-list"),
    reviewTaskDrawer: document.querySelector("#review-task-drawer"),
    reviewTaskTitle: document.querySelector("#review-task-title"),
    reviewTaskContext: document.querySelector("#review-task-context"),
    reviewTaskHistory: document.querySelector("#review-task-history"),
    reviewTaskStockImpact: document.querySelector("#review-task-stock-impact"),
    reviewTaskActions: document.querySelector("#review-task-actions"),
    confirmCommandDialog: document.querySelector("#confirm-command-dialog"),
    confirmCommandTitle: document.querySelector("#confirm-command-title"),
    confirmCommandMessage: document.querySelector("#confirm-command-message")
  };
}

function bindNavigation() {
  document.addEventListener("click", (event) => {
    const element = event.target.closest("[data-view], [data-view-link], [data-workspace]");
    if (!element || element.disabled || element.getAttribute("aria-disabled") === "true") {
      return;
    }

    const view = element.dataset.view || element.dataset.viewLink;
    const workspace = element.dataset.workspace;

    if (view) {
      showView(view);
      closeSidebarOnMobile();
    }

    if (workspace) {
      openWorkspace(workspace, {
        tab: element.dataset.workspaceTab,
        filter: element.dataset.workspaceFilter,
        trigger: element
      });
      closeSidebarOnMobile();
    }
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
    WarenwirtschaftApp.state.stockMovementsLoaded = false;
    WarenwirtschaftApp.state.stockMovements = [];
    applyRoleDefaults();
    renderRoleNavigation();
    updateWorkspaceAccess();
    renderDashboardMetricCards();

    if (WarenwirtschaftApp.state.activeWorkspace && !canOpenWorkspace(WarenwirtschaftApp.state.activeWorkspace)) {
      closeWorkspace();
    }

    ensureRoleLanding();
    renderTopContextBar();
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

function bindCommandPrimitives() {
  document.querySelectorAll("[data-command-form]").forEach((form) => {
    initializeCommandForm(form);

    const reasonSelect = form.querySelector("[data-reason-select]");
    if (reasonSelect) {
      updateReasonChips(reasonSelect.value, form);
    }
  });
}

function bindActions() {
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => runAction(button.dataset.action, button));
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
      return;
    }

    if (event.key === "Escape" && WarenwirtschaftApp.state.ui.isSidebarOpenMobile) {
      closeSidebarOnMobile();
    }
  });
}

function bindShellControls() {
  WarenwirtschaftApp.refs.sidebarToggle.addEventListener("click", () => {
    if (isMobileViewport()) {
      WarenwirtschaftApp.state.ui.isSidebarOpenMobile = !WarenwirtschaftApp.state.ui.isSidebarOpenMobile;
    } else {
      WarenwirtschaftApp.state.ui.isSidebarCollapsed = !WarenwirtschaftApp.state.ui.isSidebarCollapsed;
      localStorage.setItem("ww.sidebarCollapsed", WarenwirtschaftApp.state.ui.isSidebarCollapsed ? "1" : "0");
    }
    syncShellState();
  });

  window.addEventListener("resize", () => {
    if (!isMobileViewport() && WarenwirtschaftApp.state.ui.isSidebarOpenMobile) {
      WarenwirtschaftApp.state.ui.isSidebarOpenMobile = false;
      syncShellState();
    }
  });
}

function bindConnectivityEvents() {
  window.addEventListener("online", () => updateConnectionStatus("online"));
  window.addEventListener("offline", () => updateConnectionStatus("offline"));
}

function syncShellState() {
  const mobileViewport = isMobileViewport();
  WarenwirtschaftApp.refs.appShell.classList.toggle(
    "is-sidebar-collapsed",
    !mobileViewport && WarenwirtschaftApp.state.ui.isSidebarCollapsed
  );
  WarenwirtschaftApp.refs.appShell.classList.toggle("is-sidebar-open", WarenwirtschaftApp.state.ui.isSidebarOpenMobile);

  const isExpanded = mobileViewport
    ? WarenwirtschaftApp.state.ui.isSidebarOpenMobile
    : !WarenwirtschaftApp.state.ui.isSidebarCollapsed;
  WarenwirtschaftApp.refs.sidebarToggle.setAttribute("aria-expanded", String(isExpanded));
}

function closeSidebarOnMobile() {
  if (!isMobileViewport() || !WarenwirtschaftApp.state.ui.isSidebarOpenMobile) {
    return;
  }

  WarenwirtschaftApp.state.ui.isSidebarOpenMobile = false;
  syncShellState();
}

function bindReasonChips() {
  document.querySelectorAll("[data-reason-chip]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const form = chip.closest("[data-command-form]") || document.querySelector("#quick-booking-form");
      const select = form?.querySelector("[data-reason-select]") || form?.elements?.reason;
      if (!select) {
        return;
      }

      select.value = chip.dataset.reasonChip;
      updateReasonChips(select.value, form);
      markCommandFormAsFilling(form);
      updateCommandEffectPreview(form);
    });
  });
}

function initializeCommandForm(form) {
  if (!form) {
    return;
  }

  ensureCommandFormState(form);
  setCommandFormStatus(form, "idle");
  setCommandRetryAvailable(form, false);
  clearCommandWarningBanner(form);
  refreshCommandIdempotencyKey(form);
  updateCommandEffectPreview(form);

  const sync = () => {
    markCommandFormAsFilling(form);
    const reasonSelect = form.querySelector("[data-reason-select]");
    if (reasonSelect) {
      updateReasonChips(reasonSelect.value, form);
    }
    updateCommandEffectPreview(form);
  };

  form.addEventListener("input", sync);
  form.addEventListener("change", sync);

  const retryButton = form.querySelector("[data-command-retry]");
  if (retryButton) {
    retryButton.addEventListener("click", () => {
      if (form.dataset.commandState === "submitting") {
        return;
      }

      if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
        return;
      }

      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
  }
}

function ensureCommandFormState(form) {
  const formName = form?.dataset?.commandForm;
  if (!formName) {
    return null;
  }

  if (!WarenwirtschaftApp.state.commandForms[formName]) {
    WarenwirtschaftApp.state.commandForms[formName] = {
      status: "idle",
      idempotencyKey: "",
      statusMessage: "",
      retryable: false,
      lastCommittedIdempotencyKey: ""
    };
  }

  return WarenwirtschaftApp.state.commandForms[formName];
}

function setCommandFormStatus(form, status, message = "") {
  const formState = ensureCommandFormState(form);
  if (!formState) {
    return;
  }

  formState.status = status;
  formState.statusMessage = message;
  form.dataset.commandState = status;
  form.setAttribute("aria-busy", String(status === "submitting"));

  const statusElement = form.querySelector("[data-command-form-status]");
  if (statusElement) {
    const base = commandFormStatusLabel[status] || status;
    statusElement.textContent = message ? `${base}: ${message}` : base;
  }

  const primary = form.querySelector("[data-command-primary]");
  if (primary) {
    primary.disabled = status === "submitting";
    primary.setAttribute("aria-disabled", String(status === "submitting"));
  }

  const retryButton = form.querySelector("[data-command-retry]");
  if (retryButton) {
    const showRetry = status === "failed" && Boolean(formState.retryable);
    retryButton.hidden = !showRetry;
    retryButton.disabled = status === "submitting";
  }
}

function setCommandRetryAvailable(form, retryable) {
  const formState = ensureCommandFormState(form);
  if (!formState) {
    return;
  }

  formState.retryable = Boolean(retryable);
  if (form.dataset.commandState) {
    setCommandFormStatus(form, form.dataset.commandState, formState.statusMessage);
  }
}

function setCommandWarningBanner(form, message, tone = "warning") {
  const warningBanner = form?.querySelector("[data-command-warning-banner]");
  if (!warningBanner) {
    return;
  }

  warningBanner.classList.remove("is-error", "is-info");
  warningBanner.textContent = message || "";
  warningBanner.hidden = !message;

  if (!message) {
    return;
  }

  if (tone === "error") {
    warningBanner.classList.add("is-error");
    return;
  }

  if (tone === "info") {
    warningBanner.classList.add("is-info");
  }
}

function clearCommandWarningBanner(form) {
  setCommandWarningBanner(form, "");
}

function markCommandFormAsFilling(form) {
  if (!form || !form.dataset.commandForm) {
    return;
  }

  const currentStatus = form.dataset.commandState || "idle";
  if (currentStatus === "submitting" || currentStatus === "validating") {
    return;
  }

  setCommandRetryAvailable(form, false);
  clearCommandWarningBanner(form);
  setCommandFormStatus(form, "filling");
}

function renderCommandEffectPreviews() {
  document.querySelectorAll("[data-command-form]").forEach((form) => {
    updateCommandEffectPreview(form);
  });
}

function updateCommandEffectPreview(form) {
  if (!form) {
    return;
  }

  const preview = form.querySelector("[data-command-effect-preview]");
  if (!preview) {
    return;
  }

  const data = formData(form);
  const effect = calculateCommandEffect(form.dataset.commandForm, data);
  const behavior = commandBehaviorText(form.dataset.commandForm, data);
  const payloadName = form.dataset.commandPayload || "";
  const warning = getStockWarningMessage(form.dataset.commandForm, effect, data);
  const warningElement = form.querySelector("[data-command-stock-warning]");

  if (warningElement) {
    warningElement.textContent = warning || "";
    warningElement.classList.toggle("is-warning", Boolean(warning));
    warningElement.hidden = !warning;
  }

  preview.innerHTML = `
    <h4>Effect Preview</h4>
    <p class="command-effect-intent">${escapeHtml(behavior)}</p>
    ${payloadName ? `<p class="command-effect-payload">Payload: ${escapeHtml(payloadName)}</p>` : ""}
    <div class="command-effect-grid">
      <p><span>Before</span><strong>${escapeHtml(formatEffectNumber(effect.before))}</strong></p>
      <p><span>Delta</span><strong>${escapeHtml(formatEffectNumber(effect.delta, true))}</strong></p>
      <p><span>After</span><strong>${escapeHtml(formatEffectNumber(effect.after))}</strong></p>
      <p><span>Unit</span><strong>${escapeHtml(effect.unit || "-")}</strong></p>
      <p><span>Status</span><strong>${escapeHtml(effectStatusLabel(effect.status))}</strong></p>
    </div>
  `;
}

function commandBehaviorText(commandFormName, data = {}) {
  if (commandFormName === "goods-receipt") {
    return "Bestand steigt";
  }
  if (commandFormName === "quick-booking") {
    return data.movementType === "goods-receipt" ? "Bestand steigt" : "Bestand sinkt";
  }
  if (commandFormName === "withdrawal") {
    return "Bestand sinkt";
  }
  if (commandFormName === "purchase-order") {
    return "Bestellung verändert Bestand nicht";
  }
  if (commandFormName === "correction") {
    return "Bestand ändert sich erst nach Admin-Freigabe";
  }

  return "Bestandsauswirkung wird geprüft";
}

function effectStatusLabel(status) {
  const normalized = String(status || "n/a");
  const mapping = {
    projected: "Projektiert",
    no_snapshot: "Kein Snapshot",
    below_zero: "Unter Null",
    pending_review: "Review ausstehend",
    no_stock_effect: "Kein Bestands-Effekt",
    "n/a": "n/a"
  };

  return mapping[normalized] || normalized;
}

function getStockWarningMessage(commandFormName, effect, data) {
  if (commandFormName !== "withdrawal" && commandFormName !== "quick-booking") {
    return "";
  }

  if (commandFormName === "quick-booking" && data.movementType === "goods-receipt") {
    return "";
  }

  const stock = findStock(data.inventoryItemId);
  if (!stock) {
    return "Warnung: Kein Snapshot-Bestand für diesen Artikel gefunden.";
  }

  if (effect.after !== null && Number(effect.after) < 0) {
    return "Warnung: Entnahme führt zu negativem Bestand.";
  }

  if (stock.status === "negative") {
    return "Warnung: Artikel ist bereits im negativen Bestand.";
  }

  if (stock.status === "low") {
    return "Warnung: Artikel ist bereits unter Mindestbestand.";
  }

  return "";
}

function calculateCommandEffect(commandFormName, data) {
  const stock = findStock(data.inventoryItemId);
  const before = stock ? Number(stock.currentStock) : null;
  const commandUnit = data.unit || stock?.unit || "-";
  const readQuantity = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 0;
    }

    return parsed;
  };
  const createEffect = (delta, status) => ({
    before,
    delta,
    after: before === null || delta === null ? null : before + delta,
    unit: commandUnit,
    status
  });

  if (commandFormName === "withdrawal") {
    const delta = -Math.abs(readQuantity(data.quantity));
    const status = before === null ? "no_snapshot" : before + delta < 0 ? "below_zero" : "projected";
    return createEffect(delta, status);
  }

  if (commandFormName === "goods-receipt") {
    const delta = Math.abs(readQuantity(data.quantity));
    return createEffect(delta, before === null ? "no_snapshot" : "projected");
  }

  if (commandFormName === "quick-booking") {
    const quantity = Math.abs(readQuantity(data.quantity));
    const delta = data.movementType === "goods-receipt" ? quantity : -quantity;
    const status = before === null ? "no_snapshot" : before + delta < 0 ? "below_zero" : "projected";
    return createEffect(delta, status);
  }

  if (commandFormName === "correction") {
    const delta = readQuantity(data.expectedDelta);
    return createEffect(delta, "pending_review");
  }

  if (commandFormName === "purchase-order") {
    return {
      before: null,
      delta: null,
      after: null,
      unit: commandUnit,
      status: "no_stock_effect"
    };
  }

  return {
    before: null,
    delta: null,
    after: null,
    unit: commandUnit,
    status: "n/a"
  };
}

function formatEffectNumber(value, withSign = false) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }

  const formatted = new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 2
  }).format(numeric);
  if (!withSign) {
    return formatted;
  }

  return numeric > 0 ? `+${formatted}` : formatted;
}

function generateIdempotencyKey() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function refreshCommandIdempotencyKey(form) {
  const formState = ensureCommandFormState(form);
  if (!formState) {
    return "";
  }

  const key = generateIdempotencyKey();
  formState.idempotencyKey = key;
  const keyView = form.querySelector("[data-command-idempotency-key]");
  if (keyView) {
    keyView.textContent = key;
  }
  const keyInput = form.querySelector("[data-command-idempotency-input]");
  if (keyInput) {
    keyInput.value = key;
  }

  return key;
}

function getCommandIdempotencyKey(form) {
  const formState = ensureCommandFormState(form);
  if (!formState) {
    return "";
  }

  if (formState.idempotencyKey) {
    return formState.idempotencyKey;
  }

  return refreshCommandIdempotencyKey(form);
}

async function openConfirmCommandDialog({ title, message, actionLabel }) {
  const dialog = WarenwirtschaftApp.refs.confirmCommandDialog;
  if (!dialog || typeof dialog.showModal !== "function") {
    return window.confirm(`${title}\n\n${message}`);
  }

  if (dialog.open) {
    dialog.close("cancel");
  }

  WarenwirtschaftApp.refs.confirmCommandTitle.textContent = title;
  WarenwirtschaftApp.refs.confirmCommandMessage.textContent = message;
  const confirmButton = dialog.querySelector(".confirm-command-primary");
  if (confirmButton) {
    confirmButton.textContent = actionLabel || "Bestätigen";
  }

  return new Promise((resolve) => {
    const handleClose = () => {
      dialog.removeEventListener("close", handleClose);
      resolve(dialog.returnValue === "confirm");
    };

    dialog.addEventListener("close", handleClose);
    dialog.showModal();
  });
}

function buildCommandConfirmMessage(form, effect) {
  const data = formData(form);
  const label = form.querySelector("h3")?.textContent || "Command";
  const unit = effect.unit || "-";
  const warning = getStockWarningMessage(form.dataset.commandForm, effect, data);
  const core = `${label} · ${commandBehaviorText(form.dataset.commandForm, data)} · Before ${formatEffectNumber(effect.before)} ${unit}, Delta ${formatEffectNumber(effect.delta, true)} ${unit}, After ${formatEffectNumber(effect.after)} ${unit}, Status ${effectStatusLabel(effect.status)}.`;

  return warning ? `${core}\n\n${warning}` : core;
}

function formatSignedQuantity(quantity, unit, sign = "") {
  const numeric = Number(quantity);
  const absolute = Number.isFinite(numeric) ? Math.abs(numeric) : 0;
  const formatted = new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 2
  }).format(absolute);
  return `${sign}${formatted} ${unit || "-"}`;
}

function buildCommandSuccessMessage(formName, data, effect) {
  const unit = effect.unit || data.unit || "-";

  if (formName === "goods-receipt" || (formName === "quick-booking" && data.movementType === "goods-receipt")) {
    return `Wareneingang gebucht. Bestand ${formatSignedQuantity(data.quantity, unit, "+")}. Weiteren Wareneingang buchen?`;
  }

  if (formName === "withdrawal" || (formName === "quick-booking" && data.movementType !== "goods-receipt")) {
    return `Entnahme gespeichert. Bestand ${formatSignedQuantity(data.quantity, unit, "−")}. Weitere Entnahme?`;
  }

  if (formName === "correction") {
    return "Korrektur beantragt. Admin prüft, kein Bestandseffekt. Status in Korrekturen verfolgen.";
  }

  if (formName === "purchase-order") {
    return "Bestellung gespeichert. Bestand unverändert. Als bestellt markieren?";
  }

  return "Aktion gespeichert. Bestand unverändert.";
}

function normalizeSentence(message, fallback) {
  const text = String(message || "").trim();
  if (!text) {
    return fallback;
  }

  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function isDuplicateCommandError(error) {
  const statusCode = Number(error?.statusCode || 0);
  const message = String(error?.message || "").toLowerCase();

  if (statusCode === 409 && /(duplicate|idempot|bereits|already)/.test(message)) {
    return true;
  }

  return /(bereits gebucht|bereits verarbeitet|already processed)/.test(message);
}

function isTimeoutError(error) {
  return Boolean(error?.isTimeout || error?.code === "timeout");
}

function isRoleRejectedError(error) {
  const statusCode = Number(error?.statusCode || 0);
  return statusCode === 401 || statusCode === 403;
}

function buildCommandFailureFeedback(error) {
  if (isDuplicateCommandError(error)) {
    const duplicateMessage = "Bereits gebucht. Bestand wurde nicht erneut verändert. Verlauf prüfen.";
    return {
      status: "duplicate",
      statusMessage: "Bereits gebucht",
      retryable: false,
      toastTone: "warning",
      toastMessage: duplicateMessage,
      bannerTone: "info",
      bannerMessage: duplicateMessage
    };
  }

  if (isTimeoutError(error)) {
    return {
      status: "failed",
      statusMessage: "Zeitüberschreitung",
      retryable: true,
      toastTone: "warning",
      toastMessage: "Netzwerk-Timeout. Bestand wurde nicht verändert. Erneut versuchen?",
      bannerTone: "warning",
      bannerMessage: "Verbindung langsam. Bitte warte oder versuche es erneut. Bestand wurde nicht verändert."
    };
  }

  if (isRoleRejectedError(error)) {
    return {
      status: "rejected",
      statusMessage: "Nicht erlaubt",
      retryable: false,
      toastTone: "warning",
      toastMessage: "Diese Aktion ist für deine aktuelle Rolle nicht verfügbar. Bestand wurde nicht verändert.",
      bannerTone: "error",
      bannerMessage: "Diese Aktion ist für deine aktuelle Rolle nicht verfügbar. Bestand wurde nicht verändert."
    };
  }

  const statusCode = Number(error?.statusCode || 0);
  const base = normalizeSentence(error?.message, "Buchung fehlgeschlagen.");
  return {
    status: "failed",
    statusMessage: base,
    retryable: !statusCode || statusCode >= 500,
    toastTone: "error",
    toastMessage: `${base} Bestand wurde nicht verändert. Erneut versuchen?`,
    bannerTone: "error",
    bannerMessage: `${base} Bestand wurde nicht verändert.`
  };
}

async function submitCommandForm(event, execute) {
  event.preventDefault();
  const form = event.target;
  if (!form || !form.dataset.commandForm) {
    return { committed: false };
  }

  setCommandFormStatus(form, "validating");
  setCommandRetryAvailable(form, false);
  clearCommandWarningBanner(form);
  if (!form.reportValidity()) {
    setCommandFormStatus(form, "failed", "Pflichtfelder prüfen");
    setCommandWarningBanner(form, "Pflichtfelder prüfen. Bestand wurde nicht verändert.", "warning");
    return { committed: false };
  }

  const data = formData(form);
  const effect = calculateCommandEffect(form.dataset.commandForm, data);
  const confirmed = await openConfirmCommandDialog({
    title: form.dataset.commandConfirmTitle || "Command bestätigen?",
    message: buildCommandConfirmMessage(form, effect),
    actionLabel: form.dataset.commandConfirmAction || "Bestätigen"
  });
  if (!confirmed) {
    setCommandFormStatus(form, "filling", "Abgebrochen");
    return { committed: false };
  }

  const idempotencyKey = getCommandIdempotencyKey(form);
  const formState = ensureCommandFormState(form);
  if (formState?.lastCommittedIdempotencyKey === idempotencyKey) {
    const duplicateMessage = "Bereits gebucht. Bestand wurde nicht erneut verändert. Verlauf prüfen.";
    setCommandRetryAvailable(form, false);
    setCommandFormStatus(form, "duplicate", "Bereits gebucht");
    setCommandWarningBanner(form, duplicateMessage, "info");
    showToast(duplicateMessage, { tone: "warning" });
    return { committed: false, duplicate: true };
  }

  setCommandFormStatus(form, "submitting");

  try {
    await execute(data, {
      form,
      idempotencyKey,
      effect
    });
    const successMessage = buildCommandSuccessMessage(form.dataset.commandForm, data, effect);
    setCommandRetryAvailable(form, false);
    clearCommandWarningBanner(form);
    setCommandFormStatus(form, "committed");
    if (formState) {
      formState.lastCommittedIdempotencyKey = idempotencyKey;
    }
    showToast(successMessage, { tone: "success" });
    refreshCommandIdempotencyKey(form);
    updateCommandEffectPreview(form);
    return { committed: true, data, form, effect, idempotencyKey };
  } catch (error) {
    const feedback = buildCommandFailureFeedback(error);
    setCommandRetryAvailable(form, feedback.retryable);
    setCommandFormStatus(form, feedback.status, feedback.statusMessage);
    setCommandWarningBanner(form, feedback.bannerMessage, feedback.bannerTone);
    showToast(feedback.toastMessage, { tone: feedback.toastTone });
    return { committed: false };
  }
}

function bindMasterDataEvents() {
  document.querySelector("#purchase-order-item").addEventListener("change", (event) => {
    syncItemDefaults(event.target.value, "#purchase-order-form");
  });
  document.querySelector("#goods-receipt-order").addEventListener("change", prefillReceiptFromOrder);
  WarenwirtschaftApp.refs.goodsReceiptMode?.addEventListener("change", () => {
    applyGoodsReceiptMode();
    markCommandFormAsFilling(document.querySelector("#goods-receipt-form"));
  });
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

  applyGoodsReceiptMode();
}

function applyGoodsReceiptMode() {
  const form = document.querySelector("#goods-receipt-form");
  if (!form) {
    return;
  }

  const mode = form.elements.receiptMode?.value || "with-order";
  const orderSelect = form.elements.purchaseOrderId;
  const hint = WarenwirtschaftApp.refs.goodsReceiptModeHint;
  const isFree = mode === "free";

  if (orderSelect) {
    orderSelect.disabled = isFree;
    orderSelect.required = !isFree;
    if (isFree) {
      orderSelect.value = "";
    }
  }

  if (hint) {
    hint.textContent = isFree
      ? "Freier Wareneingang: ohne Bestellung. Bestand steigt nach bestätigtem Command."
      : "Mit Bestellung: offene Bestellung wählen. Bestand steigt nach bestätigtem Command.";
  }

  updateCommandEffectPreview(form);
}

function bindStockWorkspaceEvents() {
  if (
    !WarenwirtschaftApp.refs.stockFilterStatus ||
    !WarenwirtschaftApp.refs.stockFilterLocation ||
    !WarenwirtschaftApp.refs.stockFilterCategory ||
    !WarenwirtschaftApp.refs.stockFilterSearch
  ) {
    return;
  }

  const filters = [
    WarenwirtschaftApp.refs.stockFilterStatus,
    WarenwirtschaftApp.refs.stockFilterLocation,
    WarenwirtschaftApp.refs.stockFilterCategory
  ];

  filters.forEach((select) => {
    select.addEventListener("change", () => {
      syncStockFiltersFromInputs();
      renderStockViews();
    });
  });

  WarenwirtschaftApp.refs.stockFilterSearch.addEventListener("input", () => {
    syncStockFiltersFromInputs();
    renderStockViews();
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-stock-detail]");
    if (!button) {
      return;
    }

    openStockDetail(button.dataset.stockDetail);
  });
}

function bindReviewWorkspaceEvents() {
  document.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-review-task-open]");
    if (openButton) {
      openReviewTaskDrawer(openButton.dataset.reviewTaskOpen);
      return;
    }

    const closeButton = event.target.closest("[data-action='close-review-task-drawer']");
    if (closeButton) {
      closeReviewTaskDrawer();
      return;
    }

    const commandButton = event.target.closest("[data-review-command]");
    if (commandButton) {
      void submitReviewCommand(commandButton);
    }
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

function applyRoleDefaults() {
  WarenwirtschaftApp.state.currentLocation = roleDefaultLocation[WarenwirtschaftApp.state.actorRole] || "Hauptlager";
  localStorage.setItem("ww.currentLocation", WarenwirtschaftApp.state.currentLocation);
}

function syncDevForm() {
  WarenwirtschaftApp.refs.apiBase.value = WarenwirtschaftApp.state.apiBase;
  WarenwirtschaftApp.refs.actorId.value = WarenwirtschaftApp.state.actorId;
  WarenwirtschaftApp.refs.actorRole.value = WarenwirtschaftApp.state.actorRole;
}

function getAllowedNavigationItems() {
  return navigationItems.filter((item) => item.roles.includes(WarenwirtschaftApp.state.actorRole));
}

function getMobileNavigationItems() {
  const allowed = getAllowedNavigationItems();
  const preferred = mobilePrimaryNavigationByRole[WarenwirtschaftApp.state.actorRole] || [];

  return preferred
    .map((id) => allowed.find((item) => item.id === id))
    .filter(Boolean);
}

function navigationButtonMarkup(item) {
  const attrs = [`class="nav-item"`, `data-nav-id="${escapeHtml(item.id)}"`];

  if (item.target === "view") {
    attrs.push(`data-view="${escapeHtml(item.view)}"`);
  } else {
    attrs.push(`data-workspace="${escapeHtml(item.workspace)}"`);
    if (item.tab) {
      attrs.push(`data-workspace-tab="${escapeHtml(item.tab)}"`);
    }
    if (item.filter) {
      attrs.push(`data-workspace-filter="${escapeHtml(item.filter)}"`);
    }
  }

  return `
    <button type="button" ${attrs.join(" ")}>
      <span class="nav-item-icon" aria-hidden="true">${escapeHtml(item.icon)}</span>
      <span class="nav-item-label">${escapeHtml(item.label)}</span>
    </button>
  `;
}

function renderRoleNavigation() {
  if (WarenwirtschaftApp.refs.sidebarNav) {
    WarenwirtschaftApp.refs.sidebarNav.innerHTML = getAllowedNavigationItems().map(navigationButtonMarkup).join("");
  }
  if (WarenwirtschaftApp.refs.mobileNav) {
    WarenwirtschaftApp.refs.mobileNav.innerHTML = getMobileNavigationItems().map(navigationButtonMarkup).join("");
  }
  updateWorkspaceNavigation();
}

function getDashboardMetricFixturesForRole() {
  return dashboardMetricFixtures.filter((metric) => metric.roles.includes(WarenwirtschaftApp.state.actorRole));
}

function dashboardMetricValue(metric) {
  if (metric.state === "loading") {
    return "Lädt…";
  }
  if (metric.state === "empty") {
    return "Keine Daten";
  }
  if (metric.state === "error") {
    return "Fehler";
  }

  return String(metric.value ?? 0);
}

function dashboardMetricSubline(metric) {
  if (metric.state === "loading") {
    return "Daten werden vorbereitet";
  }
  if (metric.state === "empty") {
    return "Für den gewählten Zeitraum liegen keine bestätigten Bewegungen vor.";
  }
  if (metric.state === "error") {
    return metric.errorMessage || "Metrik konnte nicht geladen werden.";
  }

  return metric.description;
}

function dashboardMetricCardMarkup(metric) {
  const attributes = [
    `type="button"`,
    `class="status-card status-card--tone-${escapeHtml(metric.tone || "neutral")} is-clickable dashboard-metric-card is-${escapeHtml(metric.state)}"`,
    `data-dashboard-metric-card`,
    `data-workspace="${escapeHtml(metric.workspace)}"`,
    `data-workspace-tab="${escapeHtml(metric.tab || "live")}"`,
    `aria-label="${escapeHtml(`${metric.label}: ${dashboardMetricValue(metric)}. ${dashboardMetricSubline(metric)}`)}"`
  ];

  if (metric.filter) {
    attributes.push(`data-workspace-filter="${escapeHtml(metric.filter)}"`);
  }

  return `
    <button ${attributes.join(" ")}>
      <span>${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(dashboardMetricValue(metric))}</strong>
      <p class="dashboard-metric-detail">${escapeHtml(dashboardMetricSubline(metric))}</p>
      <small>Öffnen</small>
    </button>
  `;
}

function renderDashboardMetricCards() {
  if (!WarenwirtschaftApp.refs.dashboardMetricGrid) {
    return;
  }

  const fixtures = getDashboardMetricFixturesForRole();
  WarenwirtschaftApp.state.dashboardMetrics = fixtures;

  if (!fixtures.length) {
    WarenwirtschaftApp.refs.dashboardMetricGrid.innerHTML = `<p class="empty-state">Keine Statuskarten für diese Rolle.</p>`;
    return;
  }

  WarenwirtschaftApp.refs.dashboardMetricGrid.innerHTML = fixtures.map(dashboardMetricCardMarkup).join("");
}

function getActiveNavigationId() {
  if (WarenwirtschaftApp.state.activeWorkspace) {
    const activeWorkspace = normalizeWorkspaceName(WarenwirtschaftApp.state.activeWorkspace);
    return navigationItems.find((item) => item.workspace === activeWorkspace)?.id || activeWorkspace;
  }

  const defaultViewItem = getAllowedNavigationItems().find((item) => item.target === "view" && item.view === "dashboard");
  return defaultViewItem?.id || null;
}

function updateRoleVisibility() {
  const role = WarenwirtschaftApp.state.actorRole;
  document.querySelectorAll("[data-role-visibility]").forEach((element) => {
    const roles = String(element.dataset.roleVisibility || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    element.hidden = roles.length ? !roles.includes(role) : false;
  });
}

function renderTopContextBar() {
  const roleLabel = rolePresentation[WarenwirtschaftApp.state.actorRole] || WarenwirtschaftApp.state.actorRole;
  const location = WarenwirtschaftApp.state.currentLocation || "Hauptlager";
  const connection = connectionPresentation[WarenwirtschaftApp.state.connectionStatus] || connectionPresentation.degraded;

  WarenwirtschaftApp.refs.contextRole.textContent = `Rolle: ${roleLabel}`;
  WarenwirtschaftApp.refs.contextLocation.textContent = `Lagerort: ${location}`;
  WarenwirtschaftApp.refs.contextConnection.textContent = `Verbindung: ${connection.label}`;
  WarenwirtschaftApp.refs.contextConnection.classList.remove("is-ok", "is-warning", "is-danger");
  WarenwirtschaftApp.refs.contextConnection.classList.add(`is-${connection.tone}`);
}

function updateConnectionStatus(status) {
  if (WarenwirtschaftApp.state.connectionStatus === status) {
    return;
  }

  WarenwirtschaftApp.state.connectionStatus = status;
  renderTopContextBar();
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 1023px)").matches;
}

function isStaffRole() {
  return WarenwirtschaftApp.state.actorRole === "staff";
}

function ensureRoleLanding() {
  if (!isStaffRole()) {
    return;
  }

  if (WarenwirtschaftApp.state.activeWorkspace) {
    return;
  }

  openWorkspace("quick-booking");
}

function showView(viewName) {
  if (viewName === "dashboard") {
    closeWorkspace();
    WarenwirtschaftApp.refs.title.textContent = "Übersicht";
  } else {
    openWorkspace(viewName);
  }

  updateWorkspaceNavigation();
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
  WarenwirtschaftApp.refs.title.textContent = workspace.title;
  renderWorkspaceShell(normalizedWorkspaceName);
  updateWorkspaceNavigation();
  loadWorkspace(normalizedWorkspaceName);
  document.querySelector("[data-action='close-workspace']").focus();
  return true;
}

function closeWorkspace() {
  const trigger = WarenwirtschaftApp.state.lastWorkspaceTrigger;
  closeStockDetail();
  closeReviewTaskDrawer();
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
  WarenwirtschaftApp.refs.title.textContent = isStaffRole() ? "Schnellbuchen" : "Übersicht";
  if (isStaffRole()) {
    ensureRoleLanding();
  }

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
    "review-tasks": `${data.reviewTasks.length} offene Prüfaufgaben · nur Admin`,
    "staff-history": "Eigene Bewegungen als read-only Verlauf",
    "staff-hints": "Hinweise für Schicht und Lagerort"
  };
  WarenwirtschaftApp.refs.workspaceContext.textContent = context[workspaceName] || "";
}

function updateWorkspaceNavigation() {
  const activeId = getActiveNavigationId();
  document.querySelectorAll("[data-nav-id]").forEach((item) => {
    const isActive = item.dataset.navId === activeId;
    item.classList.toggle("is-active", isActive);
    if (isActive) {
      item.setAttribute("aria-current", "page");
    } else {
      item.removeAttribute("aria-current");
    }
  });
}

function updateWorkspaceAccess() {
  updateRoleVisibility();

  document.querySelectorAll("[data-workspace]").forEach((element) => {
    const isAllowed = canOpenWorkspace(element.dataset.workspace);
    element.disabled = !isAllowed;
    element.setAttribute("aria-disabled", String(!isAllowed));

    if (
      element.matches(
        "[data-dashboard-card], [data-dashboard-metric-card], .quick-actions button, .status-strip [data-workspace]"
      )
    ) {
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
  return workspaceName === "quick-book" ? "quick-booking" : workspaceName;
}

function loadWorkspace(workspaceName) {
  const workspace = workspaces[workspaceName];
  if (!workspace || !workspace.load) {
    renderWorkspaceContext(workspaceName);
    return Promise.resolve();
  }

  return workspace.load().catch((error) => showToast(error.message, true));
}

function createAppError(message, details = {}) {
  const error = new Error(message);
  Object.assign(error, details);
  return error;
}

async function apiFetch(path, options = {}) {
  const { includeActor = true, timeoutMs, ...fetchOptions } = options;
  let response;
  let timeoutHandle = null;
  const timeoutController = typeof timeoutMs === "number" && timeoutMs > 0 ? new AbortController() : null;
  const requestSignal = timeoutController ? timeoutController.signal : fetchOptions.signal;

  try {
    if (timeoutController) {
      timeoutHandle = window.setTimeout(() => {
        timeoutController.abort();
      }, timeoutMs);
    }

    response = await fetch(`${WarenwirtschaftApp.state.apiBase}${path}`, {
      ...fetchOptions,
      signal: requestSignal,
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
  } catch (error) {
    updateConnectionStatus(navigator.onLine ? "degraded" : "offline");
    if (error?.name === "AbortError" && timeoutController) {
      throw createAppError("Netzwerk-Timeout", {
        code: "timeout",
        isTimeout: true
      });
    }

    throw createAppError(error?.message || "Netzwerkfehler", {
      code: "network_error"
    });
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (_error) {
      payload = {};
    }
  }

  if (!response.ok) {
    updateConnectionStatus(response.status >= 500 ? "degraded" : "online");
    throw createAppError(payload.message || `HTTP ${response.status}`, {
      statusCode: response.status,
      responsePayload: payload
    });
  }

  updateConnectionStatus("online");
  return payload;
}

async function refreshDashboard() {
  renderDashboardMetricCards();

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

async function runAction(action, source = null) {
  try {
    if (action === "close-workspace") {
      closeWorkspace();
    }
    if (action === "close-stock-detail") {
      closeStockDetail();
    }
    if (action === "close-review-task-drawer") {
      closeReviewTaskDrawer();
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
    if (action === "refresh-dashboard-metrics") {
      renderDashboardMetricCards();
      showToast("Dashboard-Statuskarten aus Fixtures aktualisiert.");
    }
    if (action === "refresh-idempotency-key") {
      const form = source?.closest("[data-command-form]");
      if (form) {
        refreshCommandIdempotencyKey(form);
        markCommandFormAsFilling(form);
      }
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
  renderCommandEffectPreviews();
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
  applyGoodsReceiptMode();
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
  const form = document.querySelector("#goods-receipt-form");
  if (form?.elements?.receiptMode?.value === "free") {
    return;
  }

  const order = findOrder(event.target.value);
  if (!order) {
    return;
  }

  const firstPendingItem = order.items.find((item) => item.pendingQty > 0) || order.items[0];
  if (!firstPendingItem) {
    return;
  }

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

  updateCommandEffectPreview(form);
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
  updateCommandEffectPreview(form);
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
    inventoryItemActivityBadge(item.isActive)
  ], emptyStates.items);
  updateMetricCardTones();
}

async function loadStock() {
  if (!WarenwirtschaftApp.state.masterData.stock.length) {
    await loadMasterData();
  }

  if (WarenwirtschaftApp.state.actorRole === "admin" && !WarenwirtschaftApp.state.stockMovementsLoaded) {
    await loadStockMovements();
  }

  renderStockViews();
  renderActiveWorkspaceContext();
}

function renderStockViews() {
  const stockRows = WarenwirtschaftApp.state.masterData.stock;
  const criticalRows = getCriticalStockRows();
  renderStockFilterOptions(stockRows);
  syncStockFilterInputs();

  const filteredRows = getFilteredStockRows(false);
  const filteredCriticalRows = getFilteredStockRows(true);
  document.querySelector("#metric-alerts").textContent = criticalRows.length;
  renderStockTable("#stock-table", filteredRows, emptyStates.stock);
  renderStockCardList("#stock-card-list", filteredRows, emptyStates.stock);
  renderStockTable("#critical-stock-table", filteredCriticalRows, emptyStates.criticalStock);
  renderStockCardList("#critical-stock-card-list", filteredCriticalRows, emptyStates.criticalStock);
  renderStockDetailIfSelected();
  updateMetricCardTones();
}

function renderStockTable(selector, rows, emptyMessage) {
  renderTable(selector, columns.stock, rows, (item) => [
    item.name,
    item.category || "-",
    item.currentStock,
    item.unit,
    stockStatusBadge(item.status),
    formatDateTime(item.lastMovementAt),
    `<button type="button" data-stock-detail="${escapeHtml(item.inventoryItemId)}">Details</button>`
  ], emptyMessage);
}

function renderStockCardList(selector, rows, emptyMessage) {
  const container = document.querySelector(selector);
  if (!container) {
    return;
  }

  if (!rows.length) {
    container.innerHTML = `<p class="empty-state">${escapeHtml(emptyMessage)}</p>`;
    return;
  }

  container.innerHTML = rows
    .map(
      (item) => `
        <article class="panel stock-card">
          <div class="stock-card-head">
            <strong>${escapeHtml(item.name)}</strong>
            ${stockStatusBadge(item.status)}
          </div>
          <p class="stock-card-meta">${escapeHtml(item.category || "Keine Kategorie")} · ${escapeHtml(item.storageLocationName || "Ohne Lagerort")}</p>
          <p class="stock-card-value">${escapeHtml(String(item.currentStock))} ${escapeHtml(item.unit)}</p>
          <p class="stock-card-meta">Letzte Bewegung: ${escapeHtml(formatDateTime(item.lastMovementAt))}</p>
          <button type="button" data-stock-detail="${escapeHtml(item.inventoryItemId)}">Details</button>
        </article>
      `
    )
    .join("");
}

function renderStockFilterOptions(rows) {
  const locationSelect = WarenwirtschaftApp.refs.stockFilterLocation;
  const categorySelect = WarenwirtschaftApp.refs.stockFilterCategory;
  if (!locationSelect || !categorySelect) {
    return;
  }

  const currentLocation = locationSelect.value;
  const currentCategory = categorySelect.value;
  const locations = Array.from(new Set(rows.map((item) => item.storageLocationName).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "de")
  );
  const categories = Array.from(new Set(rows.map((item) => item.category).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "de")
  );

  locationSelect.innerHTML = [`<option value="">Alle Lagerorte</option>`]
    .concat(locations.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`))
    .join("");
  categorySelect.innerHTML = [`<option value="">Alle Kategorien</option>`]
    .concat(categories.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`))
    .join("");

  if (locations.includes(currentLocation)) {
    locationSelect.value = currentLocation;
  }
  if (categories.includes(currentCategory)) {
    categorySelect.value = currentCategory;
  }
}

function syncStockFilterInputs() {
  WarenwirtschaftApp.refs.stockFilterStatus.value = WarenwirtschaftApp.state.stockUi.filters.status;
  WarenwirtschaftApp.refs.stockFilterLocation.value = WarenwirtschaftApp.state.stockUi.filters.location;
  WarenwirtschaftApp.refs.stockFilterCategory.value = WarenwirtschaftApp.state.stockUi.filters.category;
  WarenwirtschaftApp.refs.stockFilterSearch.value = WarenwirtschaftApp.state.stockUi.filters.search;
}

function syncStockFiltersFromInputs() {
  WarenwirtschaftApp.state.stockUi.filters = {
    status: WarenwirtschaftApp.refs.stockFilterStatus.value,
    location: WarenwirtschaftApp.refs.stockFilterLocation.value,
    category: WarenwirtschaftApp.refs.stockFilterCategory.value,
    search: WarenwirtschaftApp.refs.stockFilterSearch.value.trim()
  };
}

function getFilteredStockRows(criticalOnly) {
  const { status, location, category, search } = WarenwirtschaftApp.state.stockUi.filters;
  const normalizedSearch = search.toLowerCase();

  return WarenwirtschaftApp.state.masterData.stock.filter((item) => {
    if (criticalOnly && !["low", "negative"].includes(item.status)) {
      return false;
    }

    if (status && item.status !== status) {
      return false;
    }

    if (location && (item.storageLocationName || "") !== location) {
      return false;
    }

    if (category && (item.category || "") !== category) {
      return false;
    }

    if (normalizedSearch) {
      const haystack = [item.name, item.inventoryItemId, item.category, item.storageLocationName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(normalizedSearch)) {
        return false;
      }
    }

    return true;
  });
}

async function loadStockMovements() {
  try {
    const payload = await apiFetch("/admin/inventory/movements");
    WarenwirtschaftApp.state.stockMovements = payload.movements || [];
  } catch (_error) {
    WarenwirtschaftApp.state.stockMovements = [];
  } finally {
    WarenwirtschaftApp.state.stockMovementsLoaded = true;
  }
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
    purchaseOrderStatusBadge(order.status),
    order.supplierName || order.supplierId || "-",
    order.items.map((item) => `${item.inventoryItemName || item.inventoryItemId}: ${item.pendingQty} ${item.unit}`).join(", ")
  ], emptyStates.purchaseOrders);
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
  const tasks = payload.tasks || [];
  WarenwirtschaftApp.state.masterData.reviewTasks = tasks;
  hydrateCorrectionReviewIndexFromTasks(tasks);
  markUpdated();
  document.querySelector("#metric-tasks").textContent = tasks.length;
  renderReviewTaskCards(tasks);
  renderReviewTaskTable("#dashboard-review-table", tasks.slice(0, 5));
  updateMetricCardTones();
  renderActiveWorkspaceContext();
}

function renderReviewTaskTable(selector, tasks) {
  renderTable(selector, columns.tasks, tasks, (task) => [
    task.type,
    reviewTaskStatusBadge(task.status),
    reviewSeverityBadge(task.severity),
    task.title,
    `<button type="button" data-workspace="review-tasks" data-workspace-tab="tasks" data-review-task-open="${escapeHtml(task.id)}">Öffnen</button>`
  ], emptyStates.reviewTasks);
}

function renderReviewTaskCards(tasks) {
  const container = WarenwirtschaftApp.refs.reviewTaskCardList;
  if (!container) {
    return;
  }

  if (!tasks.length) {
    container.innerHTML = `<p class="empty-state">${escapeHtml(emptyStates.reviewTasks)}</p>`;
    closeReviewTaskDrawer();
    return;
  }

  container.innerHTML = tasks.map((task) => reviewCardMarkup(task)).join("");

  if (
    WarenwirtschaftApp.state.reviewUi.selectedTaskId &&
    !tasks.some((task) => task.id === WarenwirtschaftApp.state.reviewUi.selectedTaskId)
  ) {
    closeReviewTaskDrawer();
  } else if (WarenwirtschaftApp.state.reviewUi.selectedTaskId) {
    renderReviewTaskDrawer();
  }
}

function reviewCardMarkup(task) {
  return `
    <article class="review-card">
      <div class="review-card-head">
        <p class="review-card-type">${escapeHtml(reviewTypeLabel(task.type))}</p>
        ${reviewTaskStatusBadge(task.status)}
      </div>
      <h4>${escapeHtml(task.title)}</h4>
      <p class="review-card-meta">
        ${reviewSeverityBadge(task.severity)}
        <span>${escapeHtml(formatDateTime(task.createdAt))}</span>
      </p>
      <p class="review-card-description">${escapeHtml(task.description || "Keine Zusatznotiz vorhanden.")}</p>
      <button type="button" data-review-task-open="${escapeHtml(task.id)}">Review öffnen</button>
    </article>
  `;
}

async function submitItem(event) {
  event.preventDefault();
  await submitJson(event.target, "/admin/inventory/items", "Artikel angelegt.");
  await loadMasterData();
  setWorkspaceTab("stock");
}

function buildRecordGoodsReceiptCommand(data) {
  const mode = data.receiptMode === "free" ? "free" : "with-order";
  return {
    commandType: "RecordGoodsReceiptCommand",
    mode,
    purchaseOrderId: mode === "with-order" ? data.purchaseOrderId || undefined : undefined,
    items: [
      {
        inventoryItemId: data.inventoryItemId,
        quantity: Number(data.quantity),
        unit: data.unit,
        storageLocationId: data.storageLocationId || undefined
      }
    ]
  };
}

function toGoodsReceiptRequest(command) {
  return {
    purchaseOrderId: command.purchaseOrderId,
    items: command.items
  };
}

function buildRecordWithdrawalCommand(data) {
  return {
    commandType: "RecordWithdrawalCommand",
    inventoryItemId: data.inventoryItemId,
    quantity: Number(data.quantity),
    unit: data.unit,
    storageLocationId: data.storageLocationId || undefined,
    reason: data.reason || "",
    note: data.note || ""
  };
}

function composeWithdrawalNote(reason, note) {
  const normalizedReason = String(reason || "").trim();
  const normalizedNote = String(note || "").trim();

  if (normalizedReason && normalizedNote) {
    return `${normalizedReason} · ${normalizedNote}`;
  }

  return normalizedReason || normalizedNote || undefined;
}

function toWithdrawalRequest(command) {
  return {
    inventoryItemId: command.inventoryItemId,
    quantity: command.quantity,
    unit: command.unit,
    storageLocationId: command.storageLocationId,
    note: composeWithdrawalNote(command.reason, command.note)
  };
}

function buildRequestCorrectionCommand(data) {
  return {
    commandType: "RequestCorrectionCommand",
    inventoryItemId: data.inventoryItemId,
    expectedDelta: Number(data.expectedDelta),
    unit: data.unit,
    reason: data.reason
  };
}

function toCorrectionRequest(command) {
  return {
    inventoryItemId: command.inventoryItemId,
    expectedDelta: command.expectedDelta,
    unit: command.unit,
    reason: command.reason
  };
}

async function submitPurchaseOrder(event) {
  await submitCommandForm(event, async (data, meta) => {
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
    await postJson("/admin/purchase-orders", body, "", {
      idempotencyKey: meta.idempotencyKey
    });
    await loadMasterData();
    setWorkspaceTab("open");
  });
}

async function submitGoodsReceipt(event) {
  await submitCommandForm(event, async (data, meta) => {
    const command = buildRecordGoodsReceiptCommand(data);
    await createGoodsReceipt(command, meta.idempotencyKey);
    await Promise.allSettled([loadGoodsReceipts(), loadMasterData()]);
    setWorkspaceTab("receipts");
  });
}

async function submitWithdrawal(event) {
  await submitCommandForm(event, async (data, meta) => {
    const command = buildRecordWithdrawalCommand(data);
    await createWithdrawal(command, meta.idempotencyKey);
    await loadMasterData();
  });
}

async function submitQuickBook(event) {
  const outcome = await submitCommandForm(event, async (data, meta) => {
    if (data.movementType === "goods-receipt") {
      const command = buildRecordGoodsReceiptCommand({
        ...data,
        receiptMode: "free"
      });
      await createGoodsReceipt(command, meta.idempotencyKey);
      await Promise.allSettled([loadGoodsReceipts(), loadMasterData()]);
    } else {
      const command = buildRecordWithdrawalCommand(data);
      await createWithdrawal(command, meta.idempotencyKey);
      await loadMasterData();
    }
  });
  if (!outcome.committed) {
    return;
  }

  const form = outcome.form;
  const data = outcome.data;
  WarenwirtschaftApp.state.lastQuickBooking = {
    quantity: data.quantity,
    unit: data.unit,
    inventoryItemId: data.inventoryItemId,
    reason: data.reason || data.note || "-"
  };
  renderLastQuickBooking();
  form.reset();
  form.elements.reason.value = "Verbrauch Küche";
  updateReasonChips("Verbrauch Küche", form);
  form.elements.inventoryItemId.focus();
  updateCommandEffectPreview(form);
}

async function submitCorrection(event) {
  await submitCommandForm(event, async (data, meta) => {
    const command = buildRequestCorrectionCommand(data);
    const result = await postJson(
      "/correction-requests",
      toCorrectionRequest(command),
      "",
      {
        idempotencyKey: meta.idempotencyKey
      }
    );
    rememberCorrectionReviewMapping(result, command);
    await refreshReviewTasksIfAllowed();
  });
}

async function createGoodsReceipt(command, idempotencyKey) {
  const body = toGoodsReceiptRequest(command);
  await postJson("/goods-receipts", body, "", {
    idempotencyKey
  });
}

async function createWithdrawal(command, idempotencyKey) {
  await postJson(
    "/withdrawals",
    toWithdrawalRequest(command),
    "",
    {
      idempotencyKey
    }
  );
}

async function submitJson(form, path, successMessage) {
  await postJson(path, normalizeFormValues(formData(form)), successMessage);
  form.reset();
}

async function postJson(path, body, successMessage, options = {}) {
  const payload = await apiFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: options.timeoutMs ?? commandRequestTimeoutMs,
    headers: options.idempotencyKey
      ? {
          "x-idempotency-key": options.idempotencyKey
        }
      : undefined
  });
  if (successMessage) {
    showToast(successMessage);
  }

  return payload;
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

function updateMetricCardTones() {
  const criticalRows = getCriticalStockRows();
  const hasNegativeStock = criticalRows.some((row) => row.status === "negative");
  const highestSeverity = getHighestReviewSeverity();

  setCardTone(WarenwirtschaftApp.refs.metricItemsCard, "info");
  setCardTone(
    WarenwirtschaftApp.refs.metricAlertsCard,
    hasNegativeStock ? "danger" : criticalRows.length > 0 ? "warning" : "ok"
  );
  setCardTone(
    WarenwirtschaftApp.refs.metricTasksCard,
    highestSeverity === "high"
      ? "danger"
      : highestSeverity === "medium"
        ? "warning"
        : highestSeverity === "low"
          ? "info"
          : "ok"
  );
}

function setCardTone(card, tone) {
  if (!card) {
    return;
  }

  card.classList.remove(
    "status-card--tone-neutral",
    "status-card--tone-ok",
    "status-card--tone-info",
    "status-card--tone-warning",
    "status-card--tone-danger"
  );
  card.classList.add(`status-card--tone-${tone}`);
}

function getHighestReviewSeverity() {
  const tasks = WarenwirtschaftApp.state.masterData.reviewTasks;

  if (tasks.some((task) => String(task.severity).toLowerCase() === "high")) {
    return "high";
  }
  if (tasks.some((task) => String(task.severity).toLowerCase() === "medium")) {
    return "medium";
  }
  if (tasks.some((task) => String(task.severity).toLowerCase() === "low")) {
    return "low";
  }

  return null;
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

function updateReasonChips(activeReason, scope = document) {
  scope.querySelectorAll("[data-reason-chip]").forEach((chip) => {
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

function findStockByName(name) {
  const normalized = String(name || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return (
    WarenwirtschaftApp.state.masterData.stock.find((stock) => String(stock.name || "").trim().toLowerCase() === normalized) ||
    null
  );
}

function getReviewTaskById(taskId) {
  return WarenwirtschaftApp.state.masterData.reviewTasks.find((task) => task.id === taskId) || null;
}

function isCorrectionReviewTask(task) {
  return String(task?.type || "").toLowerCase() === "inventory.correction_request";
}

function parseCorrectionRequestIdFromText(text) {
  const normalized = String(text || "");
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/(?:correctionrequestid|korrektur-id)\s*[:=]\s*([A-Za-z0-9_-]+)/i);
  return match?.[1] || null;
}

function parseCorrectionDeltaFromText(text) {
  const normalized = String(text || "");
  const match = normalized.match(/Korrektur um\s+(-?\d+(?:[.,]\d+)?)\s*([^\s.,;]+)/i);
  if (!match) {
    return {
      expectedDelta: null,
      unit: null
    };
  }

  const numeric = Number(match[1].replace(",", "."));
  return {
    expectedDelta: Number.isFinite(numeric) ? numeric : null,
    unit: match[2] || null
  };
}

function normalizeReviewDescription(description) {
  return String(description || "")
    .replace(/\s*\[(?:correctionRequestId|Korrektur-ID)\s*[:=]\s*[A-Za-z0-9_-]+\]\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function reviewTypeLabel(type) {
  const normalized = String(type || "").toLowerCase();
  if (normalized === "inventory.correction_request") {
    return "Korrekturprüfung";
  }
  if (normalized === "inventory.negative_stock_risk") {
    return "Negativbestand-Risiko";
  }
  if (normalized === "inventory.unlinked_receipt") {
    return "Wareneingang ohne Bestellung";
  }
  if (normalized === "inventory.overdelivery") {
    return "Überlieferung";
  }

  return type || "Review";
}

function hydrateCorrectionReviewIndexFromTasks(tasks) {
  tasks.forEach((task) => {
    if (!isCorrectionReviewTask(task)) {
      return;
    }

    const existing = WarenwirtschaftApp.state.correctionReviewIndex[task.id] || {};
    const description = normalizeReviewDescription(task.description || task.title || "");
    const parsedCorrectionRequestId = parseCorrectionRequestIdFromText(task.description || "");
    const parsedDelta = parseCorrectionDeltaFromText(description);
    const itemNameMatch = description.match(/^([^:]+):\s*Korrektur um/i);
    const stockFromName = itemNameMatch ? findStockByName(itemNameMatch[1]) : null;

    WarenwirtschaftApp.state.correctionReviewIndex[task.id] = {
      ...existing,
      correctionRequestId: existing.correctionRequestId || parsedCorrectionRequestId || null,
      inventoryItemId: existing.inventoryItemId || stockFromName?.inventoryItemId || null,
      expectedDelta:
        typeof existing.expectedDelta === "number" && Number.isFinite(existing.expectedDelta)
          ? existing.expectedDelta
          : parsedDelta.expectedDelta,
      unit: existing.unit || parsedDelta.unit || stockFromName?.unit || null,
      reason: existing.reason || description || null
    };
  });
}

function rememberCorrectionReviewMapping(result, command) {
  if (!result?.reviewTaskId || !result?.correctionRequestId) {
    return;
  }

  WarenwirtschaftApp.state.correctionReviewIndex[result.reviewTaskId] = {
    correctionRequestId: result.correctionRequestId,
    inventoryItemId: command.inventoryItemId,
    expectedDelta: command.expectedDelta,
    unit: command.unit,
    reason: command.reason
  };
}

function extractCorrectionReviewContext(task) {
  const remembered = WarenwirtschaftApp.state.correctionReviewIndex[task.id] || {};
  const description = normalizeReviewDescription(task.description || task.title || "");
  const deltaFromText = parseCorrectionDeltaFromText(description);
  const correctionRequestId = remembered.correctionRequestId || parseCorrectionRequestIdFromText(task.description || "");
  const expectedDelta =
    typeof remembered.expectedDelta === "number" && Number.isFinite(remembered.expectedDelta)
      ? remembered.expectedDelta
      : deltaFromText.expectedDelta;
  const itemFromId = remembered.inventoryItemId ? findItem(remembered.inventoryItemId) : null;
  let stock = remembered.inventoryItemId ? findStock(remembered.inventoryItemId) : null;
  let itemName = itemFromId?.name || stock?.name || null;

  if (!itemName) {
    const itemNameMatch = description.match(/^([^:]+):\s*Korrektur um/i);
    if (itemNameMatch) {
      itemName = itemNameMatch[1].trim();
    }
  }

  if (!stock && itemName) {
    stock = findStockByName(itemName);
  }

  return {
    correctionRequestId: correctionRequestId || null,
    inventoryItemId: remembered.inventoryItemId || stock?.inventoryItemId || null,
    itemName: itemFromId?.name || stock?.name || itemName || "-",
    expectedDelta,
    unit: remembered.unit || deltaFromText.unit || stock?.unit || itemFromId?.defaultUnit || "-",
    reason: remembered.reason || description || "-"
  };
}

function openReviewTaskDrawer(taskId) {
  if (!taskId) {
    return;
  }

  WarenwirtschaftApp.state.reviewUi.selectedTaskId = taskId;
  renderReviewTaskDrawer();
}

function closeReviewTaskDrawer() {
  WarenwirtschaftApp.state.reviewUi.selectedTaskId = null;
  if (WarenwirtschaftApp.refs.reviewTaskDrawer) {
    WarenwirtschaftApp.refs.reviewTaskDrawer.hidden = true;
  }
}

function renderReviewTaskDrawer() {
  const drawer = WarenwirtschaftApp.refs.reviewTaskDrawer;
  const taskId = WarenwirtschaftApp.state.reviewUi.selectedTaskId;
  if (!drawer || !taskId) {
    closeReviewTaskDrawer();
    return;
  }

  const task = getReviewTaskById(taskId);
  if (!task) {
    closeReviewTaskDrawer();
    return;
  }

  const correctionContext = isCorrectionReviewTask(task) ? extractCorrectionReviewContext(task) : null;
  drawer.hidden = false;
  WarenwirtschaftApp.refs.reviewTaskTitle.textContent = task.title;
  WarenwirtschaftApp.refs.reviewTaskContext.innerHTML = `
    <dt>Typ</dt><dd>${escapeHtml(reviewTypeLabel(task.type))}</dd>
    <dt>Status</dt><dd>${reviewTaskStatusBadge(task.status)}</dd>
    <dt>Schwere</dt><dd>${reviewSeverityBadge(task.severity)}</dd>
    <dt>Erstellt</dt><dd>${escapeHtml(formatDateTime(task.createdAt))}</dd>
    <dt>Artikel</dt><dd>${escapeHtml(correctionContext?.itemName || "-")}</dd>
    <dt>Bestand</dt><dd>${escapeHtml(correctionContext?.inventoryItemId ? formatEffectNumber(findStock(correctionContext.inventoryItemId)?.currentStock) : "-")} ${escapeHtml(correctionContext?.unit || "-")}</dd>
    <dt>Auslöser</dt><dd>${escapeHtml(task.description || "-")}</dd>
    <dt>Notiz</dt><dd>${escapeHtml(correctionContext?.reason || "-")}</dd>
  `;

  if (correctionContext?.inventoryItemId) {
    const history = getStockTimelineEvents(correctionContext.inventoryItemId);
    WarenwirtschaftApp.refs.reviewTaskHistory.innerHTML = history.length
      ? `<ol class="stock-movement-timeline">${history
          .map(
            (event) => `
              <li>
                <p>${escapeHtml(event.label)}</p>
                <p>${escapeHtml(event.detail)}</p>
                <p>${escapeHtml(formatDateTime(event.at))}</p>
              </li>
            `
          )
          .join("")}</ol>`
      : `<p class="empty-state">Keine Historie für diesen Artikel verfügbar.</p>`;
  } else {
    WarenwirtschaftApp.refs.reviewTaskHistory.innerHTML = `<p class="empty-state">Artikelkontext nicht verfügbar.</p>`;
  }

  if (isCorrectionReviewTask(task) && correctionContext?.expectedDelta !== null && correctionContext?.expectedDelta !== undefined) {
    const direction = Number(correctionContext.expectedDelta) > 0 ? "steigt" : "sinkt";
    const formattedDelta = formatSignedQuantity(correctionContext.expectedDelta, correctionContext.unit, "");
    WarenwirtschaftApp.refs.reviewTaskStockImpact.textContent = `Bei Freigabe ${direction} der Bestand um ${formattedDelta}.`;
    WarenwirtschaftApp.refs.reviewTaskStockImpact.hidden = false;
  } else if (isCorrectionReviewTask(task)) {
    WarenwirtschaftApp.refs.reviewTaskStockImpact.textContent =
      "Bei Freigabe wird eine Korrekturbewegung erzeugt. Bestand ändert sich erst danach.";
    WarenwirtschaftApp.refs.reviewTaskStockImpact.hidden = false;
  } else {
    WarenwirtschaftApp.refs.reviewTaskStockImpact.hidden = true;
    WarenwirtschaftApp.refs.reviewTaskStockImpact.textContent = "";
  }

  WarenwirtschaftApp.refs.reviewTaskActions.innerHTML = reviewTaskActionsMarkup(task, correctionContext);
}

function reviewTaskActionsMarkup(task, correctionContext) {
  if (WarenwirtschaftApp.state.actorRole !== "admin") {
    return `<p class="empty-state">Review-Entscheidungen sind nur für Admin sichtbar.</p>`;
  }

  const actions = [];
  if (isCorrectionReviewTask(task)) {
    if (correctionContext?.correctionRequestId) {
      actions.push(
        `<button type="button" data-review-command="approve-correction" data-task-id="${escapeHtml(task.id)}" data-correction-request-id="${escapeHtml(correctionContext.correctionRequestId)}">Korrektur freigeben</button>`,
        `<button type="button" data-review-command="reject-correction" data-task-id="${escapeHtml(task.id)}" data-correction-request-id="${escapeHtml(correctionContext.correctionRequestId)}">Korrektur ablehnen</button>`
      );
    } else {
      actions.push(
        `<p class="warning-banner is-info">Korrektur-ID fehlt. Aufgabe zuerst mit aktuellem Request neu laden.</p>`
      );
    }
  }

  if (task.status === "open") {
    actions.push(
      `<button type="button" data-review-command="start-review" data-task-id="${escapeHtml(task.id)}">Review starten</button>`
    );
  }

  if (task.status === "open" || task.status === "in_review") {
    actions.push(
      `<button type="button" data-review-command="resolve-review" data-task-id="${escapeHtml(task.id)}">Review abschließen</button>`,
      `<button type="button" data-review-command="dismiss-review" data-task-id="${escapeHtml(task.id)}">Review verwerfen</button>`
    );
  }

  return `<div class="row-actions review-task-action-grid">${actions.join("")}</div>`;
}

function buildResolveReviewTaskCommand(task) {
  return {
    commandType: "ResolveReviewTaskCommand",
    reviewTaskId: task.id
  };
}

function buildApproveCorrectionCommand(task, correctionRequestId) {
  return {
    commandType: "ApproveCorrectionCommand",
    correctionRequestId,
    reviewTaskId: task.id
  };
}

function buildRejectCorrectionCommand(task, correctionRequestId) {
  return {
    commandType: "RejectCorrectionCommand",
    correctionRequestId,
    reviewTaskId: task.id
  };
}

function buildStartReviewTaskCommand(task) {
  return {
    commandType: "StartReviewTaskCommand",
    reviewTaskId: task.id
  };
}

function buildDismissReviewTaskCommand(task) {
  return {
    commandType: "DismissReviewTaskCommand",
    reviewTaskId: task.id
  };
}

async function submitReviewCommand(button) {
  if (!button || button.disabled || WarenwirtschaftApp.state.actorRole !== "admin") {
    return;
  }

  const taskId = button.dataset.taskId;
  const action = button.dataset.reviewCommand;
  const task = getReviewTaskById(taskId);
  if (!task || !action) {
    return;
  }

  const allActionButtons = Array.from(
    WarenwirtschaftApp.refs.reviewTaskActions?.querySelectorAll("[data-review-command]") || []
  );
  allActionButtons.forEach((element) => {
    element.disabled = true;
    element.setAttribute("aria-disabled", "true");
  });

  try {
    if (action === "start-review") {
      const command = buildStartReviewTaskCommand(task);
      await postJson(`/admin/review-tasks/${encodeURIComponent(command.reviewTaskId)}/start-review`, {}, "");
      showToast("Review gestartet. Bestand unverändert.", { tone: "info" });
      await loadReviewTasks();
      return;
    }

    if (action === "resolve-review") {
      const command = buildResolveReviewTaskCommand(task);
      await postJson(`/admin/review-tasks/${encodeURIComponent(command.reviewTaskId)}/resolve`, {}, "");
      showToast("Review abgeschlossen. Bestand unverändert.", { tone: "success" });
      await loadReviewTasks();
      return;
    }

    if (action === "dismiss-review") {
      const command = buildDismissReviewTaskCommand(task);
      await postJson(`/admin/review-tasks/${encodeURIComponent(command.reviewTaskId)}/dismiss`, {}, "");
      showToast("Review verworfen. Bestand unverändert.", { tone: "warning" });
      await loadReviewTasks();
      return;
    }

    if (action === "approve-correction") {
      const correctionRequestId = button.dataset.correctionRequestId || "";
      if (!correctionRequestId) {
        showToast("Korrektur-ID fehlt. Keine Freigabe möglich.", { tone: "warning" });
        return;
      }

      const command = buildApproveCorrectionCommand(task, correctionRequestId);
      const approval = await postJson(
        `/admin/correction-requests/${encodeURIComponent(command.correctionRequestId)}/approve`,
        {},
        ""
      );
      await postJson(`/admin/review-tasks/${encodeURIComponent(command.reviewTaskId)}/resolve`, {}, "");
      showToast(
        `Korrektur freigegeben. Bestand aktualisiert auf ${formatEffectNumber(approval.stockAfter)}.`,
        { tone: "success" }
      );
      await Promise.allSettled([loadMasterData(), loadStockMovements(), loadReviewTasks()]);
      return;
    }

    if (action === "reject-correction") {
      const correctionRequestId = button.dataset.correctionRequestId || "";
      if (!correctionRequestId) {
        showToast("Korrektur-ID fehlt. Keine Ablehnung möglich.", { tone: "warning" });
        return;
      }

      const command = buildRejectCorrectionCommand(task, correctionRequestId);
      await postJson(`/admin/correction-requests/${encodeURIComponent(command.correctionRequestId)}/reject`, {}, "");
      await postJson(`/admin/review-tasks/${encodeURIComponent(command.reviewTaskId)}/resolve`, {}, "");
      showToast("Korrektur abgelehnt. Bestand unverändert.", { tone: "warning" });
      await loadReviewTasks();
    }
  } catch (error) {
    showToast(error?.message || "Review-Aktion fehlgeschlagen.", { tone: "error" });
  } finally {
    allActionButtons.forEach((element) => {
      element.disabled = false;
      element.setAttribute("aria-disabled", "false");
    });
    renderReviewTaskDrawer();
  }
}

function openStockDetail(itemId) {
  if (!itemId) {
    return;
  }

  WarenwirtschaftApp.state.stockUi.selectedInventoryItemId = itemId;
  renderStockDetailIfSelected();
}

function closeStockDetail() {
  WarenwirtschaftApp.state.stockUi.selectedInventoryItemId = null;
  if (WarenwirtschaftApp.refs.stockDetailDrawer) {
    WarenwirtschaftApp.refs.stockDetailDrawer.hidden = true;
  }
}

function renderStockDetailIfSelected() {
  const itemId = WarenwirtschaftApp.state.stockUi.selectedInventoryItemId;
  if (!itemId) {
    WarenwirtschaftApp.refs.stockDetailDrawer.hidden = true;
    return;
  }

  const stock = findStock(itemId);
  if (!stock) {
    closeStockDetail();
    return;
  }

  const item = findItem(itemId);
  WarenwirtschaftApp.refs.stockDetailDrawer.hidden = false;
  WarenwirtschaftApp.refs.stockDetailTitle.textContent = stock.name;
  WarenwirtschaftApp.refs.stockDetailMaster.innerHTML = `
    <dt>Artikel-ID</dt><dd>${escapeHtml(stock.inventoryItemId)}</dd>
    <dt>Kategorie</dt><dd>${escapeHtml(stock.category || "-")}</dd>
    <dt>Lagerort</dt><dd>${escapeHtml(stock.storageLocationName || "-")}</dd>
    <dt>Einheit</dt><dd>${escapeHtml(stock.unit)}</dd>
    <dt>Mindestbestand</dt><dd>${escapeHtml(item?.minStock !== undefined ? String(item.minStock) : "-")}</dd>
  `;
  WarenwirtschaftApp.refs.stockDetailSnapshot.innerHTML = `
    <p><strong>${escapeHtml(String(stock.currentStock))} ${escapeHtml(stock.unit)}</strong></p>
    <p>${stockStatusBadge(stock.status)}</p>
    <p>Letzte Bewegung: ${escapeHtml(formatDateTime(stock.lastMovementAt))}</p>
  `;

  const timeline = getStockTimelineEvents(stock.inventoryItemId);
  if (!timeline.length) {
    WarenwirtschaftApp.refs.stockDetailTimeline.innerHTML = `<li>Keine Bewegungsdaten verfügbar.</li>`;
  } else {
    WarenwirtschaftApp.refs.stockDetailTimeline.innerHTML = timeline
      .map(
        (event) => `
          <li>
            <p>${escapeHtml(event.label)}</p>
            <p>${escapeHtml(event.detail)}</p>
            <p>${escapeHtml(formatDateTime(event.at))}</p>
          </li>
        `
      )
      .join("");
  }
}

function getStockTimelineEvents(inventoryItemId) {
  const movementEvents = WarenwirtschaftApp.state.stockMovements
    .filter((movement) => movement.inventoryItemId === inventoryItemId)
    .slice(0, 5)
    .map((movement) => ({
      at: movement.createdAt,
      label: movementTypeLabel(movement.type),
      detail: `${movement.quantity} ${movement.unit}${movement.note ? ` · ${movement.note}` : ""}`
    }));

  if (movementEvents.length) {
    return movementEvents;
  }

  const receiptEvents = WarenwirtschaftApp.state.masterData.goodsReceipts
    .flatMap((receipt) =>
      receipt.items
        .filter((item) => item.inventoryItemId === inventoryItemId)
        .map((item) => ({
          at: receipt.receivedAt || receipt.createdAt,
          label: "Wareneingang",
          detail: `${item.quantity} ${item.unit} · ${receipt.receivedById}`
        }))
    )
    .slice(0, 5);

  if (receiptEvents.length) {
    return receiptEvents;
  }

  const stock = findStock(inventoryItemId);
  if (!stock?.lastMovementAt) {
    return [];
  }

  return [
    {
      at: stock.lastMovementAt,
      label: "Snapshot aktualisiert",
      detail: `${stock.currentStock} ${stock.unit} · Status ${stock.status}`
    }
  ];
}

function movementTypeLabel(type) {
  const normalized = String(type || "").toLowerCase();

  if (normalized.includes("removed")) {
    return "Entnahme";
  }
  if (normalized.includes("received")) {
    return "Wareneingang";
  }
  if (normalized.includes("correction_positive")) {
    return "Korrektur +";
  }
  if (normalized.includes("correction_negative")) {
    return "Korrektur -";
  }

  return type || "Bewegung";
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
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

function semanticBadge(input) {
  const label = escapeHtml(String(input.label));
  const icon = escapeHtml(input.icon || "•");
  const tone = escapeHtml(input.tone || "neutral");
  const ariaLabel = input.ariaLabel ? ` aria-label="${escapeHtml(input.ariaLabel)}"` : "";

  return `<span class="badge is-${tone}"${ariaLabel}><span class="badge-icon" aria-hidden="true">${icon}</span><span class="badge-label">${label}</span></span>`;
}

function stockStatusBadge(rawStatus) {
  const status = String(rawStatus || "unknown").toLowerCase();
  const presentation = stockStatusPresentation[status] ?? stockStatusPresentation.unknown;

  return semanticBadge({
    label: presentation.label,
    tone: presentation.tone,
    icon: presentation.icon,
    ariaLabel: `Bestandsstatus: ${presentation.label}`
  });
}

function reviewSeverityBadge(rawSeverity) {
  const severity = String(rawSeverity || "low").toLowerCase();
  const presentation = reviewSeverityPresentation[severity] ?? reviewSeverityPresentation.low;

  return semanticBadge({
    label: presentation.label,
    tone: presentation.tone,
    icon: presentation.icon,
    ariaLabel: `Review-Schwere: ${presentation.label}`
  });
}

function reviewTaskStatusBadge(rawStatus) {
  const status = String(rawStatus || "open").toLowerCase();
  const presentation = reviewStatusPresentation[status] ?? reviewStatusPresentation.open;

  return semanticBadge({
    label: presentation.label,
    tone: presentation.tone,
    icon: presentation.icon,
    ariaLabel: `Review-Status: ${presentation.label}`
  });
}

function purchaseOrderStatusBadge(rawStatus) {
  const status = String(rawStatus || "draft").toLowerCase();
  const presentation = purchaseOrderStatusPresentation[status] ?? {
    label: rawStatus,
    tone: "neutral",
    icon: "•"
  };

  return semanticBadge({
    label: presentation.label,
    tone: presentation.tone,
    icon: presentation.icon,
    ariaLabel: `Bestellstatus: ${presentation.label}`
  });
}

function inventoryItemActivityBadge(isActive) {
  return semanticBadge({
    label: isActive ? "Aktiv" : "Inaktiv",
    tone: isActive ? "ok" : "warning",
    icon: isActive ? "✓" : "◔",
    ariaLabel: `Artikelstatus: ${isActive ? "Aktiv" : "Inaktiv"}`
  });
}

function showToast(message, options = {}) {
  const toastZone = WarenwirtschaftApp.refs.toastZone;
  if (!toastZone) {
    return;
  }

  const normalizedOptions =
    typeof options === "boolean"
      ? {
          tone: options ? "error" : "success"
        }
      : options || {};
  const tone = normalizedOptions.tone || "success";
  const durationMs =
    typeof normalizedOptions.durationMs === "number"
      ? normalizedOptions.durationMs
      : tone === "success"
        ? 4000
        : tone === "warning"
          ? 8000
          : 0;

  const toast = document.createElement("article");
  toast.className = `toast-item is-${tone}`;
  toast.setAttribute("role", tone === "error" ? "alert" : "status");

  const messageElement = document.createElement("p");
  messageElement.className = "toast-item-message";
  messageElement.textContent = String(message || "");
  toast.append(messageElement);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "toast-close";
  closeButton.setAttribute("aria-label", "Meldung schließen");
  closeButton.textContent = "×";
  toast.append(closeButton);

  let timer = null;
  const removeToast = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    toast.remove();
  };

  closeButton.addEventListener("click", removeToast);
  toastZone.prepend(toast);

  if (durationMs > 0) {
    timer = window.setTimeout(removeToast, durationMs);
  }
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
