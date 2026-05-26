const WORKSPACES = {
  ALL: {
    label: "Alle Bereiche",
    breadcrumb: "Alle Bereiche"
  },
  SERVICE: {
    label: "Service",
    breadcrumb: "Service / Getraenke / Bar-Ausschank"
  },
  HOTEL: {
    label: "Hotel",
    breadcrumb: "Hotel / Arbeitsutensilien / Reinigung"
  },
  KITCHEN: {
    label: "Kueche",
    breadcrumb: "Kueche / Lebensmittel / Frisch"
  }
};

const ACTORS = {
  ADMIN: {
    id: "user_admin",
    label: "Admin",
    nav: ["Dashboard", "Artikel", "Bestand", "Bewegungen", "Konflikte", "Governance"],
    workspaces: ["ALL", "SERVICE", "HOTEL", "KITCHEN"]
  },
  AREA_LEAD: {
    id: "user_area_lead_service",
    label: "Bereichsleitung",
    nav: ["Bereichs-Dashboard", "Bestand", "Korrekturen", "Konflikte", "Governance"],
    workspaces: ["SERVICE", "KITCHEN"]
  },
  STAFF: {
    id: "user_staff_kitchen",
    label: "Mitarbeiter",
    nav: ["Quick Actions", "Artikel suchen", "Bestand pruefen", "Offline Queue"],
    workspaces: ["KITCHEN"]
  }
};

const ITEMS = [
  {
    id: "item_tomatoes",
    name: "Tomaten",
    workspace: "KITCHEN",
    category: "FOOD",
    subcategory: "FRESH",
    unit: "kg",
    stock: 12,
    version: 3,
    minStock: 5
  },
  {
    id: "item_milk",
    name: "Milch",
    workspace: "KITCHEN",
    category: "FOOD",
    subcategory: "FRESH",
    unit: "l",
    stock: 4,
    version: 2,
    minStock: 8
  },
  {
    id: "item_beer_keg",
    name: "Bierfass 30L",
    workspace: "SERVICE",
    category: "BEVERAGES",
    subcategory: "BAR_TAP",
    unit: "Fass",
    stock: 1,
    version: 8,
    minStock: 2
  },
  {
    id: "item_cleaning_cloths",
    name: "Reinigungstuecher",
    workspace: "HOTEL",
    category: "WORK_UTENSILS",
    subcategory: "CLEANING_SUPPLIES",
    unit: "Packung",
    stock: 7,
    version: 5,
    minStock: 4
  }
];

const storage = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

const state = {
  role: storage.get("ww.actorRole", "ADMIN"),
  selectedWorkspace: storage.get("ww.selectedWorkspace", "ALL"),
  activeNav: storage.get("ww.activeNav", "Dashboard"),
  search: "",
  selectedAction: "OUT",
  selectedItemId: "item_tomatoes",
  quantity: 1,
  note: "",
  apiBase: storage.get("ww.apiBase", ""),
  overlayOpen: false,
  recentItems: storage.get("ww.recentItems", {
    "KITCHEN/FOOD/FRESH": ["item_tomatoes", "item_milk"],
    "SERVICE/BEVERAGES/BAR_TAP": ["item_beer_keg"]
  }),
  queue: storage.get("ww.offlineQueue", [])
};

const app = document.querySelector("#app");

function render() {
  const actor = ACTORS[state.role];
  const allowedWorkspaces = actor.workspaces;

  if (!allowedWorkspaces.includes(state.selectedWorkspace)) {
    state.selectedWorkspace = allowedWorkspaces[0];
  }

  if (!actor.nav.includes(state.activeNav)) {
    state.activeNav = actor.nav[0];
  }

  storage.set("ww.actorRole", state.role);
  storage.set("ww.selectedWorkspace", state.selectedWorkspace);
  storage.set("ww.activeNav", state.activeNav);
  storage.set("ww.offlineQueue", state.queue);
  storage.set("ww.recentItems", state.recentItems);
  storage.set("ww.apiBase", state.apiBase);

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar(actor)}
      <main class="main">
        ${renderTopbar(actor)}
        <section class="content">${renderSurface(actor)}</section>
      </main>
      ${renderWorkspaceOverlay(actor)}
    </div>
  `;

  bindEvents();
}

function renderSidebar(actor) {
  return `
    <aside class="sidebar" aria-label="Hauptnavigation">
      <div class="brand">
        <strong>Warenwirtschaft</strong>
        <span>Gastronovi Workflow</span>
      </div>
      <div class="role-list" role="group" aria-label="Rolle">
        ${Object.entries(ACTORS)
          .map(
            ([role, entry]) => `
              <button class="role-button" data-role="${role}" aria-pressed="${state.role === role}">
                ${entry.label}
              </button>
            `
          )
          .join("")}
      </div>
      <nav class="nav-list" aria-label="Ansichten">
        ${actor.nav
          .map(
            (nav) => `
              <button class="nav-button" data-nav="${nav}" aria-pressed="${state.activeNav === nav}">
                ${nav}
              </button>
            `
          )
          .join("")}
      </nav>
      <small>Server-wins, append-only Bewegungen, rollenbasierte Workspaces.</small>
    </aside>
  `;
}

function renderTopbar(actor) {
  return `
    <header class="topbar">
      <div class="breadcrumb" aria-label="Aktueller Kontext">
        <strong>${actor.label}</strong>
        <span>/</span>
        <span>${WORKSPACES[state.selectedWorkspace].breadcrumb}</span>
      </div>
      <input class="search-box" type="search" value="${escapeHtml(state.search)}" placeholder="Artikel suchen" aria-label="Artikel suchen" />
      <button class="secondary-button" data-open-workspaces>Bereich wechseln</button>
    </header>
  `;
}

function renderSurface(actor) {
  if (state.activeNav === "Governance") {
    return renderGovernance();
  }

  if (state.role === "STAFF") {
    return renderStaffSurface();
  }

  if (state.role === "AREA_LEAD") {
    return renderAreaLeadSurface();
  }

  return renderAdminSurface();
}

function renderAdminSurface() {
  const scopedItems = getScopedItems();
  const critical = scopedItems.filter((item) => item.stock <= item.minStock);
  const conflicts = state.queue.filter((item) => item.status === "CONFLICT");

  return `
    <div class="surface">
      <div class="section-head">
        <div>
          <h1>Admin Cockpit</h1>
          <p>Bestand, Bewegungen, Konflikte und Korrekturen nach Bereich.</p>
        </div>
        <button class="primary-button" data-open-workspaces>Daten filtern</button>
      </div>
      <div class="kpi-grid">
        ${renderKpi("Kritische Bestaende", critical.length, "warn")}
        ${renderKpi("Offene Konflikte", conflicts.length, conflicts.length ? "danger" : "ok")}
        ${renderKpi("Entnahmen heute", 7, "info")}
        ${renderKpi("Wareneingaenge", 3, "ok")}
        ${renderKpi("Korrekturen offen", 2, "warn")}
      </div>
      <div class="dashboard-grid">
        ${renderConsumptionPanel()}
        ${renderActionCenter(critical)}
      </div>
      ${renderInventoryTable(scopedItems)}
    </div>
  `;
}

function renderAreaLeadSurface() {
  const scopedItems = getScopedItems();
  const critical = scopedItems.filter((item) => item.stock <= item.minStock);

  return `
    <div class="surface">
      <div class="section-head">
        <div>
          <h1>Bereichs-Dashboard</h1>
          <p>Pruefung fuer zugewiesene Bereiche: Service und Kueche.</p>
        </div>
        <button class="secondary-button" data-open-workspaces>Bereich wechseln</button>
      </div>
      <div class="kpi-grid">
        ${renderKpi("Kritische Bestaende", critical.length, "warn")}
        ${renderKpi("Konflikte im Bereich", state.queue.filter((item) => item.status === "CONFLICT").length, "danger")}
        ${renderKpi("Korrekturen offen", 1, "warn")}
        ${renderKpi("Entnahmen heute", 4, "info")}
        ${renderKpi("Inventur", "Post-MVP", "ok")}
      </div>
      <div class="dashboard-grid">
        ${renderActionCenter(critical)}
        ${renderReviewPanel()}
      </div>
      ${renderInventoryTable(scopedItems)}
    </div>
  `;
}

function renderStaffSurface() {
  const scopedItems = getScopedItems();
  const selectedItem = scopedItems.find((item) => item.id === state.selectedItemId) || scopedItems[0];
  const unit = selectedItem ? selectedItem.unit : "";

  return `
    <div class="surface staff-shell">
      <div class="section-head">
        <div>
          <h1>Quick Actions</h1>
          <p>${WORKSPACES[state.selectedWorkspace].breadcrumb}</p>
        </div>
      </div>
      <div class="panel quick-stack">
        <div class="action-choice" role="group" aria-label="Aktion">
          ${renderActionButton("IN", "+ Warenerhalt")}
          ${renderActionButton("OUT", "- Entnahme")}
          ${renderActionButton("CHECK", "Bestand pruefen")}
        </div>
        ${renderStaffForm(scopedItems, selectedItem, unit)}
      </div>
      <div class="panel">
        <h2>Zuletzt genutzt</h2>
        <div class="recent-grid">${renderRecentItems(scopedItems)}</div>
      </div>
      <div class="panel">
        <h2>Offline Queue</h2>
        ${renderQueue()}
      </div>
    </div>
  `;
}

function renderStaffForm(scopedItems, selectedItem, unit) {
  if (state.selectedAction === "CHECK") {
    return renderInventoryTable(scopedItems);
  }

  if (!selectedItem) {
    return `<div class="empty-state">Keine Artikel im aktuellen Arbeitsbereich.</div>`;
  }

  return `
    <form class="form-grid" data-movement-form>
      <label class="field">
        <span class="label">Artikel</span>
        <select name="inventoryItemId">
          ${scopedItems
            .map(
              (item) => `
                <option value="${item.id}" ${item.id === selectedItem.id ? "selected" : ""}>
                  ${item.name} (${item.stock} ${item.unit})
                </option>
              `
            )
            .join("")}
        </select>
      </label>
      <div class="quantity-row" aria-label="Schnellmengen">
        ${[1, 5, 10]
          .map(
            (quantity) => `
              <button type="button" data-quantity="${quantity}">
                ${state.selectedAction === "OUT" ? "-" : "+"}${quantity} ${unit}
              </button>
            `
          )
          .join("")}
        <button type="button" data-quantity="custom">Eigene Menge</button>
      </div>
      <label class="field">
        <span class="label">Menge (${unit})</span>
        <input name="quantity" type="number" min="0.01" step="0.01" value="${state.quantity}" autocomplete="off" required />
      </label>
      <label class="field">
        <span class="label">Notiz</span>
        <textarea name="note" rows="3" autocomplete="off">${escapeHtml(state.note)}</textarea>
      </label>
      <button class="primary-button" type="submit">
        ${state.selectedAction === "OUT" ? "Entnahme speichern" : "Warenerhalt speichern"}
      </button>
    </form>
  `;
}

function renderActionButton(action, label) {
  return `<button type="button" data-action="${action}" aria-pressed="${state.selectedAction === action}">${label}</button>`;
}

function renderKpi(label, value, tone) {
  return `
    <article class="kpi-card">
      <span>${label}</span>
      <strong>${value}</strong>
      <span class="badge ${tone}">${toneLabel(tone)}</span>
    </article>
  `;
}

function renderConsumptionPanel() {
  const rows = [
    ["Kueche", 74],
    ["Service", 62],
    ["Hotel", 34]
  ];

  return `
    <section class="panel">
      <h2>Verbrauch nach Bereich</h2>
      <div class="bar-list">
        ${rows
          .map(
            ([label, value]) => `
              <div class="bar-row">
                <span>${label}</span>
                <div class="bar-track"><div class="bar-fill" style="width:${value}%"></div></div>
                <strong>${value}%</strong>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderActionCenter(criticalItems) {
  const conflicts = state.queue.filter((item) => item.status === "CONFLICT");

  return `
    <section class="panel">
      <h2>Action Center</h2>
      <div class="action-list">
        ${criticalItems
          .map(
            (item) => `
              <div class="queue-item">
                <strong>${item.name}</strong>
                <span class="meta">${WORKSPACES[item.workspace].label}: ${item.stock} ${item.unit}, Mindestbestand ${item.minStock}</span>
                <span class="badge warn">unter Mindestbestand</span>
              </div>
            `
          )
          .join("")}
        ${conflicts
          .map(
            (item) => `
              <div class="queue-item">
                <strong>${item.itemName}</strong>
                <span class="meta">${item.reason || "Pruefung erforderlich"}</span>
                <span class="badge danger">Konflikt</span>
              </div>
            `
          )
          .join("")}
        ${criticalItems.length === 0 && conflicts.length === 0 ? `<div class="empty-state">Keine offenen Vorgange.</div>` : ""}
      </div>
    </section>
  `;
}

function renderReviewPanel() {
  return `
    <section class="panel">
      <h2>Review</h2>
      <div class="queue-list">
        <div class="queue-item">
          <strong>Korrekturantrag</strong>
          <span class="meta">Milch, Kueche, +2 l wegen Nachlieferung</span>
          <span class="badge warn">offen</span>
        </div>
        <div class="queue-item">
          <strong>Kontrollzaehlung</strong>
          <span class="meta">Bierfass 30L, Service</span>
          <span class="badge info">angefordert</span>
        </div>
      </div>
    </section>
  `;
}

function renderInventoryTable(items) {
  if (items.length === 0) {
    return `<div class="empty-state">Keine Artikel fuer den aktuellen Filter.</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Artikel</th>
            <th>Bereich</th>
            <th>Kategorie</th>
            <th>Bestand</th>
            <th>Mindestbestand</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
                <tr>
                  <td><strong>${item.name}</strong><br /><span class="meta">Version ${item.version}</span></td>
                  <td>${WORKSPACES[item.workspace].label}</td>
                  <td>${item.category} / ${item.subcategory}</td>
                  <td>${item.stock} ${item.unit}</td>
                  <td>${item.minStock} ${item.unit}</td>
                  <td><span class="badge ${item.stock <= item.minStock ? "warn" : "ok"}">${item.stock <= item.minStock ? "kritisch" : "ok"}</span></td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderRecentItems(scopedItems) {
  const recentIds = state.recentItems[getWorkspaceKey()] || [];
  const recent = recentIds
    .map((id) => scopedItems.find((item) => item.id === id))
    .filter(Boolean);

  if (recent.length === 0) {
    return `<div class="empty-state">Noch keine zuletzt genutzten Artikel.</div>`;
  }

  return recent
    .map(
      (item) => `
        <button class="item-card" data-item="${item.id}" aria-pressed="${state.selectedItemId === item.id}">
          <strong>${item.name}</strong><br />
          <span class="meta">${item.stock} ${item.unit} verfuegbar</span>
        </button>
      `
    )
    .join("");
}

function renderQueue() {
  if (state.queue.length === 0) {
    return `<div class="empty-state">Keine lokalen Buchungen.</div>`;
  }

  return `
    <div class="queue-list">
      ${state.queue
        .map(
          (item) => `
            <div class="queue-item">
              <strong>${item.itemName}</strong>
              <span class="meta">${item.type} ${item.quantity} ${item.unit} / ${WORKSPACES[item.workspace].label}</span>
              <span class="badge ${queueTone(item.status)}">${item.status}</span>
            </div>
          `
        )
        .join("")}
    </div>
    <button class="secondary-button" data-sync-queue>Queue synchronisieren</button>
  `;
}

function renderGovernance() {
  return `
    <div class="surface">
      <div class="section-head">
        <div>
          <h1>Phase 0 / Governance</h1>
          <p>Verbindliche Leitplanken fuer Rollen, Buchungen, Konflikte und Inventur-Vorbereitung.</p>
        </div>
      </div>
      <div class="governance-grid">
        ${renderGovernancePanel("Rollen", ["ADMIN: alle Bereiche", "AREA_LEAD: zugewiesene Bereiche", "STAFF: Quick Actions im eigenen Bereich"])}
        ${renderGovernancePanel("Buchungslogik", ["Server-wins", "Append-only InventoryMovement", "Stock-Version je akzeptierter Bewegung"])}
        ${renderGovernancePanel("Konflikte", ["PENDING lokal", "ACCEPTED durch Server", "CONFLICT oder REJECTED ohne stilles Uebernehmen"])}
        ${renderGovernancePanel("Post-MVP", ["Inventur als eigenes Modul", "Delta-Buchungen nach Freigabe", "Gastronovi-Abgleich spaeter"])}
      </div>
    </div>
  `;
}

function renderGovernancePanel(title, lines) {
  return `
    <section class="panel">
      <h2>${title}</h2>
      <div class="queue-list">
        ${lines.map((line) => `<div class="queue-item">${line}</div>`).join("")}
      </div>
    </section>
  `;
}

function renderWorkspaceOverlay(actor) {
  return `
    <div class="overlay" ${state.overlayOpen ? "" : "hidden"} role="dialog" aria-modal="true" aria-labelledby="workspace-title">
      <div class="dialog">
        <div class="dialog-head">
          <h2 id="workspace-title">Arbeitsbereich</h2>
          <button class="icon-button" data-close-workspaces aria-label="Schliessen">Schliessen</button>
        </div>
        <div class="workspace-grid">
          ${actor.workspaces
            .map(
              (workspace) => `
                <button class="workspace-card" data-workspace="${workspace}" aria-pressed="${state.selectedWorkspace === workspace}">
                  <strong>${WORKSPACES[workspace].label}</strong><br />
                  <span class="meta">${WORKSPACES[workspace].breadcrumb}</span>
                </button>
              `
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-role]").forEach((button) => {
    button.addEventListener("click", () => {
      state.role = button.dataset.role;
      state.selectedWorkspace = ACTORS[state.role].workspaces[0];
      state.activeNav = ACTORS[state.role].nav[0];
      render();
    });
  });

  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeNav = button.dataset.nav;
      render();
    });
  });

  document.querySelectorAll("[data-open-workspaces]").forEach((button) => {
    button.addEventListener("click", () => {
      state.overlayOpen = true;
      render();
    });
  });

  document.querySelector("[data-close-workspaces]")?.addEventListener("click", () => {
    state.overlayOpen = false;
    render();
  });

  document.querySelectorAll("[data-workspace]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedWorkspace = button.dataset.workspace;
      state.overlayOpen = false;
      render();
    });
  });

  document.querySelector(".search-box")?.addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedAction = button.dataset.action;
      render();
    });
  });

  document.querySelectorAll("[data-quantity]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.quantity !== "custom") {
        state.quantity = Number(button.dataset.quantity);
      }
      render();
    });
  });

  document.querySelectorAll("[data-item]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedItemId = button.dataset.item;
      render();
    });
  });

  document.querySelector("[data-movement-form]")?.addEventListener("submit", handleMovementSubmit);
  document.querySelector("[data-sync-queue]")?.addEventListener("click", syncQueue);
  document.addEventListener("keydown", handleEscape, { once: true });
}

function handleEscape(event) {
  if (event.key === "Escape" && state.overlayOpen) {
    state.overlayOpen = false;
    render();
  }
}

function handleMovementSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const item = ITEMS.find((entry) => entry.id === form.get("inventoryItemId"));

  if (!item) {
    return;
  }

  const quantity = Number(form.get("quantity"));
  state.quantity = quantity;
  state.note = String(form.get("note") || "");
  state.selectedItemId = item.id;

  const queueItem = {
    clientMutationId: `client_${Date.now()}`,
    type: state.selectedAction,
    inventoryItemId: item.id,
    itemName: item.name,
    workspace: item.workspace,
    quantity,
    unit: item.unit,
    baseStockVersion: item.version,
    status: "PENDING",
    createdAt: new Date().toISOString(),
    note: state.note
  };

  state.queue = [queueItem, ...state.queue];
  rememberItem(item);
  render();
}

async function syncQueue() {
  if (!state.apiBase) {
    state.queue = state.queue.map((item, index) => ({
      ...item,
      status: index === 0 && item.type === "OUT" && item.quantity > 5 ? "CONFLICT" : "ACCEPTED",
      reason: index === 0 && item.type === "OUT" && item.quantity > 5 ? "INSUFFICIENT_STOCK" : undefined
    }));
    render();
    return;
  }

  const actor = ACTORS[state.role];
  const pending = state.queue.filter((item) => item.status === "PENDING" || item.status === "CONFLICT");
  state.queue = state.queue.map((item) =>
    pending.some((pendingItem) => pendingItem.clientMutationId === item.clientMutationId)
      ? { ...item, status: "SYNCING" }
      : item
  );
  render();

  try {
    const response = await fetch(`${state.apiBase.replace(/\/$/, "")}/movements/sync`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-actor-id": actor.id,
        "x-actor-role": state.role
      },
      body: JSON.stringify({
        items: pending.map(({ itemName, status, reason, createdAt, ...item }) => item)
      })
    });
    const data = await response.json();
    const results = new Map(data.results.map((result) => [result.clientMutationId, result]));

    state.queue = state.queue.map((item) => {
      const result = results.get(item.clientMutationId);
      return result ? { ...item, status: result.status, reason: result.reason } : item;
    });
  } catch {
    state.queue = state.queue.map((item) =>
      item.status === "SYNCING"
        ? { ...item, status: "CONFLICT", reason: "SERVER_ERROR_RETRYABLE" }
        : item
    );
  }

  render();
}

function getScopedItems() {
  const allowed = ACTORS[state.role].workspaces;
  const query = state.search.trim().toLowerCase();

  return ITEMS.filter((item) => {
    const workspaceMatches =
      state.selectedWorkspace === "ALL" ? allowed.includes("ALL") : item.workspace === state.selectedWorkspace;
    const allowedMatches = allowed.includes("ALL") || allowed.includes(item.workspace);
    const searchMatches = !query || item.name.toLowerCase().includes(query);

    return workspaceMatches && allowedMatches && searchMatches;
  });
}

function getWorkspaceKey() {
  const item = ITEMS.find((entry) => entry.id === state.selectedItemId);

  if (!item) {
    return `${state.selectedWorkspace}/FOOD/FRESH`;
  }

  return `${item.workspace}/${item.category}/${item.subcategory}`;
}

function rememberItem(item) {
  const key = `${item.workspace}/${item.category}/${item.subcategory}`;
  const current = state.recentItems[key] || [];
  state.recentItems[key] = [item.id, ...current.filter((id) => id !== item.id)].slice(0, 5);
}

function toneLabel(tone) {
  return {
    ok: "ok",
    warn: "pruefen",
    danger: "kritisch",
    info: "aktiv"
  }[tone];
}

function queueTone(status) {
  return {
    PENDING: "info",
    SYNCING: "info",
    ACCEPTED: "ok",
    CONFLICT: "danger",
    REJECTED: "danger"
  }[status];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

render();
