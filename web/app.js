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
  stock: ["Artikel", "Kategorie", "Bestand", "Einheit", "Status", "Letzte Bewegung"],
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
    roles: ["admin", "shift_lead"],
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
  bindActions();
  bindMasterDataEvents();
  bindWorkspaceShell();
  bindReasonChips();
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
    toast: document.querySelector("#toast"),
    devPanel: document.querySelector("#dev-panel"),
    apiBase: document.querySelector("#api-base"),
    actorId: document.querySelector("#actor-id"),
    actorRole: document.querySelector("#actor-role"),
    metricItemsCard: document.querySelector("#metric-items-card"),
    metricAlertsCard: document.querySelector("#metric-alerts-card"),
    metricTasksCard: document.querySelector("#metric-tasks-card"),
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

async function apiFetch(path, options = {}) {
  const { includeActor = true, ...fetchOptions } = options;
  let response;

  try {
    response = await fetch(`${WarenwirtschaftApp.state.apiBase}${path}`, {
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
  } catch (error) {
    updateConnectionStatus(navigator.onLine ? "degraded" : "offline");
    throw error;
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    updateConnectionStatus(response.status >= 500 ? "degraded" : "online");
    throw new Error(payload.message || `HTTP ${response.status}`);
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
    if (action === "refresh-dashboard-metrics") {
      renderDashboardMetricCards();
      showToast("Dashboard-Statuskarten aus Fixtures aktualisiert.");
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
  updateMetricCardTones();
}

function renderStockTable(selector, rows, emptyMessage) {
  renderTable(selector, columns.stock, rows, (item) => [
    item.name,
    item.category || "-",
    item.currentStock,
    item.unit,
    stockStatusBadge(item.status),
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
  WarenwirtschaftApp.state.masterData.reviewTasks = payload.tasks;
  markUpdated();
  document.querySelector("#metric-tasks").textContent = payload.tasks.length;
  renderReviewTasks("#review-tasks-table", payload.tasks);
  renderReviewTasks("#dashboard-review-table", payload.tasks.slice(0, 5));
  updateMetricCardTones();
  renderActiveWorkspaceContext();
}

function renderReviewTasks(selector, tasks) {
  renderTable(selector, columns.tasks, tasks, (task) => [
    task.type,
    reviewTaskStatusBadge(task.status),
    reviewSeverityBadge(task.severity),
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
