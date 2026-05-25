const STORAGE_KEY = "personal-expense-app:v2";
const LEGACY_STORAGE_KEY = "personal-expense-app:v1";
const FIREBASE_CDN = "https://www.gstatic.com/firebasejs/12.13.0";

const CATEGORY_META = {
  Comida: { color: "#15846f", icon: "M4 10h16M6 10l1 10h10l1-10M9 6h6l1 4H8l1-4Z" },
  Transporte: { color: "#4078bc", icon: "M5 16V8l2-4h10l2 4v8M7 16h10M8 19h.01M16 19h.01M7 12h10" },
  Casa: { color: "#f2b84b", icon: "M4 11 12 4l8 7v9H6v-9M10 20v-6h4v6" },
  Salud: { color: "#b83f4a", icon: "M12 5v14M5 12h14M7 7h10v10H7z" },
  Entretenimiento: { color: "#7a5fb5", icon: "M7 8h10v8H7zM9 16l3-3 3 3M9 8l3 3 3-3" },
  Compras: { color: "#c45c26", icon: "M6 8h12l-1 12H7L6 8ZM9 8a3 3 0 0 1 6 0" },
  Otros: { color: "#64736d", icon: "M12 6v.01M12 12v.01M12 18v.01" }
};

const DEFAULT_CATEGORIES = Object.keys(CATEGORY_META);
const EXTRA_CATEGORY_COLORS = ["#15846f", "#4078bc", "#f2b84b", "#b83f4a", "#7a5fb5", "#c45c26", "#64736d"];

const money = new Intl.NumberFormat("es-SV", {
  style: "currency",
  currency: "USD"
});

const monthFormatter = new Intl.DateTimeFormat("es", {
  month: "long",
  year: "numeric"
});

const shortMonthFormatter = new Intl.DateTimeFormat("es", {
  month: "short"
});

let state = loadState();
let selectedMonth = toMonthKey(new Date());
let activeView = "activity";
let firebaseApi = null;
let remoteReady = false;
let remoteUnsubscribe = null;
let saveTimer = null;
let currentUser = null;

const elements = {
  accountName: document.querySelector("#accountName"),
  amountInput: document.querySelector("#amountInput"),
  budgetDialog: document.querySelector("#budgetDialog"),
  budgetForm: document.querySelector("#budgetForm"),
  budgetInput: document.querySelector("#budgetInput"),
  budgetMessage: document.querySelector("#budgetMessage"),
  budgetProgress: document.querySelector("#budgetProgress"),
  categoryChart: document.querySelector("#categoryChart"),
  categoryDialog: document.querySelector("#categoryDialog"),
  categoryEditorList: document.querySelector("#categoryEditorList"),
  categoryForm: document.querySelector("#categoryForm"),
  categoryInput: document.querySelector("#categoryInput"),
  csvBtn: document.querySelector("#csvBtn"),
  dateInput: document.querySelector("#dateInput"),
  descriptionInput: document.querySelector("#descriptionInput"),
  expenseCount: document.querySelector("#expenseCount"),
  expenseForm: document.querySelector("#expenseForm"),
  expenseList: document.querySelector("#expenseList"),
  filterCategory: document.querySelector("#filterCategory"),
  historyCount: document.querySelector("#historyCount"),
  historyList: document.querySelector("#historyList"),
  loginBtn: document.querySelector("#loginBtn"),
  monthlyChart: document.querySelector("#monthlyChart"),
  monthlyInsight: document.querySelector("#monthlyInsight"),
  monthLabel: document.querySelector("#monthLabel"),
  manageCategoriesBtn: document.querySelector("#manageCategoriesBtn"),
  newCategoryInput: document.querySelector("#newCategoryInput"),
  nextMonth: document.querySelector("#nextMonth"),
  openBudget: document.querySelector("#openBudget"),
  pdfBtn: document.querySelector("#pdfBtn"),
  prevMonth: document.querySelector("#prevMonth"),
  remainingAmount: document.querySelector("#remainingAmount"),
  spentAmount: document.querySelector("#spentAmount"),
  syncStatus: document.querySelector("#syncStatus"),
  tabs: document.querySelectorAll(".tab"),
  themeToggle: document.querySelector("#themeToggle"),
  views: {
    activity: document.querySelector("#activityView"),
    history: document.querySelector("#historyView"),
    analytics: document.querySelector("#analyticsView")
  }
};

applyTheme(state.theme || "light");
elements.dateInput.value = toDateInputValue(new Date());
renderCategoryOptions();
initFirebase();

elements.expenseForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const expense = {
    id: createId(),
    amount: Number(elements.amountInput.value),
    category: elements.categoryInput.value,
    date: elements.dateInput.value,
    description: elements.descriptionInput.value.trim(),
    createdAt: new Date().toISOString()
  };

  if (!expense.amount || expense.amount <= 0 || !expense.description || !expense.date) return;

  state.expenses.push(expense);
  selectedMonth = toMonthKey(parseDateInput(expense.date));
  persistState();
  elements.expenseForm.reset();
  elements.dateInput.value = toDateInputValue(new Date());
  elements.descriptionInput.focus();
  render();
});

elements.expenseList.addEventListener("click", handleDelete);
elements.historyList.addEventListener("click", handleDelete);

elements.openBudget.addEventListener("click", () => {
  elements.budgetInput.value = state.budgets[selectedMonth] ?? "";
  elements.budgetDialog.showModal();
});

elements.budgetForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const action = event.submitter?.value;

  if (action === "save") {
    const value = Number(elements.budgetInput.value);
    if (value > 0) {
      state.budgets[selectedMonth] = value;
    } else {
      delete state.budgets[selectedMonth];
    }
    persistState();
    render();
  }

  elements.budgetDialog.close();
});

elements.prevMonth.addEventListener("click", () => {
  selectedMonth = shiftMonth(selectedMonth, -1);
  render();
});

elements.nextMonth.addEventListener("click", () => {
  selectedMonth = shiftMonth(selectedMonth, 1);
  render();
});

elements.filterCategory.addEventListener("change", render);
elements.csvBtn.addEventListener("click", exportCsv);
elements.pdfBtn.addEventListener("click", exportPdf);

elements.manageCategoriesBtn.addEventListener("click", () => {
  renderCategoryEditor();
  elements.categoryDialog.showModal();
});

elements.categoryEditorList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-category]");
  if (!button) return;

  const category = button.dataset.removeCategory;
  if (state.expenses.some((expense) => expense.category === category)) {
    button.closest(".category-editor-row").querySelector(".category-note").textContent = "Tiene gastos asociados";
    return;
  }

  state.categories = state.categories.filter((item) => item !== category);
  renderCategoryEditor();
});

elements.categoryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.submitter?.value === "save") {
    saveCategoryChanges();
  }
  elements.categoryDialog.close();
});

elements.themeToggle.addEventListener("click", () => {
  const nextTheme = state.theme === "dark" ? "light" : "dark";
  state.theme = nextTheme;
  applyTheme(nextTheme);
  persistState();
});

elements.loginBtn.addEventListener("click", () => {
  if (currentUser) {
    signOutUser();
  } else {
    signInWithGoogle();
  }
});

elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activeView = tab.dataset.view;
    renderTabs();
  });
});

render();

function render() {
  renderCategoryOptions();
  const monthlyExpenses = getMonthlyExpenses();
  const total = sumExpenses(monthlyExpenses);
  const budget = Number(state.budgets[selectedMonth] || 0);
  const remaining = budget - total;

  elements.monthLabel.textContent = monthFormatter.format(monthStart(selectedMonth));
  elements.spentAmount.textContent = money.format(total);
  elements.remainingAmount.textContent = budget
    ? `${money.format(Math.max(remaining, 0))} disponible`
    : "Define un presupuesto";

  renderBudget(total, budget, remaining);
  renderExpenses(monthlyExpenses);
  renderHistory();
  renderAnalytics(monthlyExpenses, total);
  renderMonthlyChart();
  renderTabs();
}

function renderCategoryOptions() {
  const selectedCategory = elements.categoryInput.value;
  const selectedFilter = elements.filterCategory.value || "Todas";

  elements.categoryInput.innerHTML = state.categories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("");

  elements.filterCategory.innerHTML = [
    '<option value="Todas">Todas</option>',
    ...state.categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
  ].join("");

  if (state.categories.includes(selectedCategory)) {
    elements.categoryInput.value = selectedCategory;
  }

  elements.filterCategory.value = state.categories.includes(selectedFilter) ? selectedFilter : "Todas";
}

function renderCategoryEditor() {
  elements.categoryEditorList.innerHTML = "";
  elements.newCategoryInput.value = "";

  state.categories.forEach((category) => {
    const row = document.createElement("div");
    row.className = "category-editor-row";
    row.innerHTML = `
      <span class="category-icon small" style="--category-color: ${categoryColor(category)}">${categoryIcon(category)}</span>
      <input type="text" value="${escapeHtml(category)}" maxlength="28" data-category-name="${escapeHtml(category)}" aria-label="Nombre de categoria">
      <button class="delete-button" type="button" data-remove-category="${escapeHtml(category)}" aria-label="Eliminar ${escapeHtml(category)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12M10 11v6M14 11v6M9 7l1-3h4l1 3M8 7l1 13h6l1-13"/></svg>
      </button>
      <span class="category-note"></span>
    `;
    elements.categoryEditorList.append(row);
  });
}

function saveCategoryChanges() {
  const renameMap = new Map();
  const nextCategories = [];
  const used = new Set();

  elements.categoryEditorList.querySelectorAll("[data-category-name]").forEach((input) => {
    const oldName = input.dataset.categoryName;
    const newName = sanitizeCategoryName(input.value);
    if (!newName || used.has(newName.toLowerCase())) return;

    renameMap.set(oldName, newName);
    nextCategories.push(newName);
    used.add(newName.toLowerCase());
  });

  const newCategory = sanitizeCategoryName(elements.newCategoryInput.value);
  if (newCategory && !used.has(newCategory.toLowerCase())) {
    nextCategories.push(newCategory);
  }

  if (!nextCategories.length) {
    nextCategories.push("Otros");
  }

  state.categories = nextCategories;
  state.expenses = state.expenses.map((expense) => ({
    ...expense,
    category: renameMap.get(expense.category) || expense.category
  }));

  persistState();
  render();
}

function renderBudget(total, budget, remaining) {
  const percent = budget ? Math.min((total / budget) * 100, 100) : 0;
  elements.budgetProgress.style.width = `${percent}%`;
  elements.budgetProgress.style.background = percent >= 100
    ? "var(--danger)"
    : percent >= 80
      ? "var(--warning)"
      : "var(--accent)";

  if (!budget) {
    elements.budgetMessage.textContent = "Agrega un limite mensual para saber cuanto margen tienes.";
  } else if (remaining < 0) {
    elements.budgetMessage.textContent = `Te pasaste por ${money.format(Math.abs(remaining))}. Conviene revisar gastos variables.`;
  } else if (percent >= 80) {
    elements.budgetMessage.textContent = `Ya usaste ${Math.round(percent)}% del presupuesto. Aun puedes ajustar el ritmo.`;
  } else {
    elements.budgetMessage.textContent = `Vas en ${Math.round(percent)}% del presupuesto mensual.`;
  }
}

function renderExpenses(monthlyExpenses) {
  const filter = elements.filterCategory.value;
  const visibleExpenses = monthlyExpenses
    .filter((expense) => filter === "Todas" || expense.category === filter)
    .sort(sortNewest);

  renderExpenseList(elements.expenseList, visibleExpenses, "Aun no hay gastos este mes.");
}

function renderHistory() {
  const allExpenses = [...state.expenses].sort(sortNewest);
  elements.historyCount.textContent = `${allExpenses.length} registros`;
  renderExpenseList(elements.historyList, allExpenses, "Aun no hay historial de gastos.");
}

function renderExpenseList(container, expenses, emptyText) {
  container.innerHTML = "";

  if (!expenses.length) {
    const empty = document.querySelector("#emptyTemplate").content.cloneNode(true);
    empty.querySelector("span").textContent = emptyText;
    container.append(empty);
    return;
  }

  expenses.forEach((expense) => {
    const item = document.createElement("article");
    item.className = "expense-item";
    item.innerHTML = `
      <div class="category-icon" style="--category-color: ${categoryColor(expense.category)}">${categoryIcon(expense.category)}</div>
      <div class="expense-main">
        <strong>${escapeHtml(expense.description)}</strong>
        <div class="expense-meta">${escapeHtml(expense.category)} · ${formatDate(expense.date)}</div>
      </div>
      <div class="expense-side">
        <div class="expense-amount">${money.format(expense.amount)}</div>
        <button class="delete-button" type="button" data-delete-id="${expense.id}" aria-label="Eliminar ${escapeHtml(expense.description)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12M10 11v6M14 11v6M9 7l1-3h4l1 3M8 7l1 13h6l1-13"/></svg>
        </button>
      </div>
    `;
    container.append(item);
  });
}

function renderAnalytics(monthlyExpenses, total) {
  const byCategory = monthlyExpenses.reduce((groups, expense) => {
    groups[expense.category] = (groups[expense.category] || 0) + expense.amount;
    return groups;
  }, {});

  const rows = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  elements.categoryChart.innerHTML = "";
  elements.expenseCount.textContent = `${monthlyExpenses.length} gastos`;

  if (!rows.length) {
    elements.categoryChart.append(document.querySelector("#emptyTemplate").content.cloneNode(true));
    elements.monthlyInsight.textContent = "Cuando registres gastos, aqui veras la categoria que mas pesa en tu mes.";
    return;
  }

  rows.forEach(([category, amount]) => {
    const percent = total ? Math.round((amount / total) * 100) : 0;
    const row = document.createElement("article");
    row.className = "chart-row";
    row.innerHTML = `
      <div class="chart-top">
        <span class="chart-label">
          <span class="category-icon small" style="--category-color: ${categoryColor(category)}">${categoryIcon(category)}</span>
          ${escapeHtml(category)}
        </span>
        <span>${money.format(amount)} · ${percent}%</span>
      </div>
      <div class="chart-bar" aria-label="${escapeHtml(category)}: ${percent}%">
        <span style="--bar-width: ${percent}%; --bar-color: ${categoryColor(category)}"></span>
      </div>
    `;
    elements.categoryChart.append(row);
  });

  const [topCategory, topAmount] = rows[0];
  elements.monthlyInsight.textContent = `${topCategory} concentra ${money.format(topAmount)} este mes. Ese es el mejor punto para revisar primero.`;
}

function renderMonthlyChart() {
  const months = getRecentMonths(6);
  const totals = months.map((month) => sumExpenses(state.expenses.filter((expense) => toMonthKey(parseDateInput(expense.date)) === month)));
  const max = Math.max(...totals, 1);

  elements.monthlyChart.innerHTML = "";

  months.forEach((month, index) => {
    const total = totals[index];
    const bar = document.createElement("button");
    bar.className = "month-bar";
    bar.type = "button";
    bar.style.setProperty("--bar-height", `${Math.max((total / max) * 100, total ? 12 : 4)}%`);
    bar.innerHTML = `
      <span class="bar-value">${money.format(total)}</span>
      <span class="bar-fill"></span>
      <span class="bar-label">${shortMonthFormatter.format(monthStart(month))}</span>
    `;
    bar.addEventListener("click", () => {
      selectedMonth = month;
      activeView = "activity";
      render();
    });
    elements.monthlyChart.append(bar);
  });
}

function renderTabs() {
  elements.tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === activeView);
  });

  Object.entries(elements.views).forEach(([view, element]) => {
    element.classList.toggle("active", view === activeView);
  });
}

function handleDelete(event) {
  const button = event.target.closest("[data-delete-id]");
  if (!button) return;

  state.expenses = state.expenses.filter((expense) => expense.id !== button.dataset.deleteId);
  persistState();
  render();
}

function exportCsv() {
  const rows = getMonthlyExpenses()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((expense) => [
      expense.date,
      expense.category,
      expense.description,
      expense.amount.toFixed(2)
    ]);

  const csv = [
    ["Fecha", "Categoria", "Descripcion", "Monto"],
    ...rows
  ].map((row) => row.map(csvCell).join(",")).join("\n");

  downloadBlob(csv, `gastos-${selectedMonth}.csv`, "text/csv;charset=utf-8");
}

function exportPdf() {
  const monthlyExpenses = getMonthlyExpenses().sort(sortNewest);
  const total = sumExpenses(monthlyExpenses);
  const budget = Number(state.budgets[selectedMonth] || 0);
  const report = window.open("", "_blank", "width=420,height=720");
  if (!report) return;

  report.document.write(`
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Reporte ${selectedMonth}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #102620; margin: 28px; }
          h1 { margin: 0 0 6px; font-size: 28px; }
          .muted { color: #64736d; }
          .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 22px 0; }
          .box { border: 1px solid #dce4df; border-radius: 8px; padding: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border-bottom: 1px solid #dce4df; padding: 9px 6px; text-align: left; }
          th:last-child, td:last-child { text-align: right; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <button onclick="window.print()">Guardar como PDF</button>
        <h1>Reporte de gastos</h1>
        <div class="muted">${monthFormatter.format(monthStart(selectedMonth))}</div>
        <section class="summary">
          <div class="box"><strong>Total</strong><br>${money.format(total)}</div>
          <div class="box"><strong>Presupuesto</strong><br>${budget ? money.format(budget) : "Sin limite"}</div>
        </section>
        <table>
          <thead><tr><th>Fecha</th><th>Categoria</th><th>Descripcion</th><th>Monto</th></tr></thead>
          <tbody>
            ${monthlyExpenses.map((expense) => `
              <tr>
                <td>${formatDate(expense.date)}</td>
                <td>${escapeHtml(expense.category)}</td>
                <td>${escapeHtml(expense.description)}</td>
                <td>${money.format(expense.amount)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </body>
    </html>
  `);
  report.document.close();
  report.focus();
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').setAttribute("content", theme === "dark" ? "#07130f" : "#102620");
}

async function initFirebase() {
  if (!hasFirebaseConfig()) {
    elements.syncStatus.textContent = "Agrega firebase-config.js para activar nube y login.";
    return;
  }

  try {
    const [{ initializeApp }, authModule, firestoreModule] = await Promise.all([
      import(`${FIREBASE_CDN}/firebase-app.js`),
      import(`${FIREBASE_CDN}/firebase-auth.js`),
      import(`${FIREBASE_CDN}/firebase-firestore.js`)
    ]);

    const app = initializeApp(window.firebaseConfig);
    const auth = authModule.getAuth(app);
    const db = firestoreModule.getFirestore(app);
    const provider = new authModule.GoogleAuthProvider();

    firebaseApi = { auth, db, provider, ...authModule, ...firestoreModule };
    elements.syncStatus.textContent = "Firebase listo. Puedes iniciar sesion con Google.";

    await firebaseApi.getRedirectResult(auth).catch(() => null);
    firebaseApi.onAuthStateChanged(auth, (user) => {
      currentUser = user;
      updateAccountUi();
      bindRemoteState();
    });
  } catch {
    elements.syncStatus.textContent = "No se pudo cargar Firebase. La app sigue en modo local.";
  }
}

async function signInWithGoogle() {
  if (!firebaseApi) {
    elements.syncStatus.textContent = "Primero completa firebase-config.js y publica la app en HTTPS.";
    return;
  }

  try {
    await firebaseApi.signInWithPopup(firebaseApi.auth, firebaseApi.provider);
  } catch {
    await firebaseApi.signInWithRedirect(firebaseApi.auth, firebaseApi.provider);
  }
}

async function signOutUser() {
  if (!firebaseApi) return;
  await firebaseApi.signOut(firebaseApi.auth);
}

function bindRemoteState() {
  if (remoteUnsubscribe) {
    remoteUnsubscribe();
    remoteUnsubscribe = null;
  }

  remoteReady = false;

  if (!firebaseApi || !currentUser) return;

  const ref = userStateRef();
  remoteUnsubscribe = firebaseApi.onSnapshot(ref, async (snapshot) => {
    if (snapshot.exists()) {
      const remote = snapshot.data();
      state = normalizeState({ ...state, ...remote });
      saveLocalState();
      render();
    } else {
      await saveRemoteState();
    }
    remoteReady = true;
    updateAccountUi();
  }, (error) => {
    showSyncError(error);
  });
}

function updateAccountUi() {
  if (!currentUser) {
    elements.accountName.textContent = "Sin cuenta conectada";
    elements.loginBtn.textContent = firebaseApi ? "Google" : "Configurar";
    elements.syncStatus.textContent = firebaseApi
      ? "Datos guardados localmente. Inicia sesion para sincronizar."
      : elements.syncStatus.textContent;
    return;
  }

  elements.accountName.textContent = currentUser.displayName || currentUser.email || "Cuenta Google";
  elements.loginBtn.textContent = "Salir";
  elements.syncStatus.textContent = remoteReady ? "Sincronizado con Firebase." : "Conectando con Firebase...";
}

function persistState() {
  state.updatedAt = new Date().toISOString();
  saveLocalState();
  scheduleRemoteSave();
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function scheduleRemoteSave() {
  if (!firebaseApi || !currentUser || !remoteReady) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveRemoteState, 350);
}

async function saveRemoteState() {
  if (!firebaseApi || !currentUser) return;
  try {
    await firebaseApi.setDoc(userStateRef(), {
      expenses: state.expenses,
      budgets: state.budgets,
      categories: state.categories,
      theme: state.theme,
      updatedAt: state.updatedAt || new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    showSyncError(error);
  }
}

function userStateRef() {
  return firebaseApi.doc(firebaseApi.db, "users", currentUser.uid, "appState", "main");
}

function showSyncError(error) {
  const code = error?.code || "error";
  const message = error?.message || "Firestore no acepto la sincronizacion.";
  elements.syncStatus.textContent = `Firestore: ${code}. Revisa reglas/base de datos.`;
  console.warn("Firestore sync error", code, message);
}

function hasFirebaseConfig() {
  const config = window.firebaseConfig || {};
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

function getMonthlyExpenses() {
  return state.expenses.filter((expense) => toMonthKey(parseDateInput(expense.date)) === selectedMonth);
}

function sumExpenses(expenses) {
  return expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
}

function loadState() {
  const v2 = readStorage(STORAGE_KEY);
  if (v2) return normalizeState(v2);

  const legacy = readStorage(LEGACY_STORAGE_KEY);
  if (legacy) return normalizeState({ ...legacy, theme: "light" });

  return normalizeState({});
}

function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function normalizeState(value) {
  const expenseCategories = Array.isArray(value?.expenses)
    ? value.expenses.map((expense) => expense.category).filter(Boolean)
    : [];
  const categories = normalizeCategories(value?.categories, expenseCategories);

  return {
    expenses: Array.isArray(value?.expenses) ? value.expenses : [],
    budgets: value?.budgets && typeof value.budgets === "object" ? value.budgets : {},
    categories,
    theme: value?.theme === "dark" ? "dark" : "light",
    updatedAt: value?.updatedAt || new Date().toISOString()
  };
}

function normalizeCategories(savedCategories, expenseCategories) {
  const categories = [
    ...(Array.isArray(savedCategories) ? savedCategories : DEFAULT_CATEGORIES),
    ...expenseCategories
  ];
  const unique = [];
  const seen = new Set();

  categories.forEach((category) => {
    const clean = sanitizeCategoryName(category);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) return;
    seen.add(key);
    unique.push(clean);
  });

  return unique.length ? unique : [...DEFAULT_CATEGORIES];
}

function toMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseDateInput(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateInputValue(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function monthStart(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function shiftMonth(monthKey, amount) {
  const date = monthStart(monthKey);
  date.setMonth(date.getMonth() + amount);
  return toMonthKey(date);
}

function getRecentMonths(count) {
  const months = [];
  const date = monthStart(selectedMonth);
  date.setMonth(date.getMonth() - count + 1);
  for (let index = 0; index < count; index += 1) {
    months.push(toMonthKey(date));
    date.setMonth(date.getMonth() + 1);
  }
  return months;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(parseDateInput(value));
}

function sortNewest(a, b) {
  return b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || "");
}

function categoryColor(category) {
  if (CATEGORY_META[category]) return CATEGORY_META[category].color;
  const index = Math.abs(hashString(category)) % EXTRA_CATEGORY_COLORS.length;
  return EXTRA_CATEGORY_COLORS[index];
}

function categoryIcon(category) {
  const path = CATEGORY_META[category]?.icon || CATEGORY_META.Otros.icon;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
}

function sanitizeCategoryName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function hashString(value) {
  return String(value).split("").reduce((hash, char) => ((hash << 5) - hash) + char.charCodeAt(0), 0);
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
