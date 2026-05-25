const STORAGE_KEY = "personal-expense-app:v1";
const CATEGORY_COLORS = {
  Comida: "#15846f",
  Transporte: "#4078bc",
  Casa: "#f2b84b",
  Salud: "#b83f4a",
  Entretenimiento: "#7a5fb5",
  Compras: "#c45c26",
  Otros: "#64736d"
};

const money = new Intl.NumberFormat("es-SV", {
  style: "currency",
  currency: "USD"
});

const monthFormatter = new Intl.DateTimeFormat("es", {
  month: "long",
  year: "numeric"
});

const state = loadState();
let selectedMonth = toMonthKey(new Date());
let activeView = "activity";

const elements = {
  amountInput: document.querySelector("#amountInput"),
  budgetDialog: document.querySelector("#budgetDialog"),
  budgetForm: document.querySelector("#budgetForm"),
  budgetInput: document.querySelector("#budgetInput"),
  budgetMessage: document.querySelector("#budgetMessage"),
  budgetProgress: document.querySelector("#budgetProgress"),
  categoryChart: document.querySelector("#categoryChart"),
  categoryInput: document.querySelector("#categoryInput"),
  dateInput: document.querySelector("#dateInput"),
  descriptionInput: document.querySelector("#descriptionInput"),
  expenseCount: document.querySelector("#expenseCount"),
  expenseForm: document.querySelector("#expenseForm"),
  expenseList: document.querySelector("#expenseList"),
  exportBtn: document.querySelector("#exportBtn"),
  filterCategory: document.querySelector("#filterCategory"),
  monthlyInsight: document.querySelector("#monthlyInsight"),
  monthLabel: document.querySelector("#monthLabel"),
  nextMonth: document.querySelector("#nextMonth"),
  openBudget: document.querySelector("#openBudget"),
  prevMonth: document.querySelector("#prevMonth"),
  remainingAmount: document.querySelector("#remainingAmount"),
  spentAmount: document.querySelector("#spentAmount"),
  tabs: document.querySelectorAll(".tab"),
  views: {
    activity: document.querySelector("#activityView"),
    analytics: document.querySelector("#analyticsView")
  }
};

elements.dateInput.value = toDateInputValue(new Date());

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

  if (!expense.amount || expense.amount <= 0 || !expense.description || !expense.date) {
    return;
  }

  state.expenses.push(expense);
  selectedMonth = toMonthKey(parseDateInput(expense.date));
  saveState();
  elements.expenseForm.reset();
  elements.dateInput.value = toDateInputValue(new Date());
  elements.descriptionInput.focus();
  render();
});

elements.expenseList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-id]");
  if (!button) return;

  const id = button.dataset.deleteId;
  state.expenses = state.expenses.filter((expense) => expense.id !== id);
  saveState();
  render();
});

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
    saveState();
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
elements.exportBtn.addEventListener("click", exportCsv);

elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activeView = tab.dataset.view;
    renderTabs();
  });
});

render();

function render() {
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
  renderAnalytics(monthlyExpenses, total);
  renderTabs();
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
    elements.budgetMessage.textContent = "Agrega un límite mensual para saber cuánto margen tienes.";
  } else if (remaining < 0) {
    elements.budgetMessage.textContent = `Te pasaste por ${money.format(Math.abs(remaining))}. Conviene revisar gastos variables.`;
  } else if (percent >= 80) {
    elements.budgetMessage.textContent = `Ya usaste ${Math.round(percent)}% del presupuesto. Aún puedes ajustar el ritmo.`;
  } else {
    elements.budgetMessage.textContent = `Vas en ${Math.round(percent)}% del presupuesto mensual.`;
  }
}

function renderExpenses(monthlyExpenses) {
  const filter = elements.filterCategory.value;
  const visibleExpenses = monthlyExpenses
    .filter((expense) => filter === "Todas" || expense.category === filter)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  elements.expenseList.innerHTML = "";

  if (!visibleExpenses.length) {
    elements.expenseList.append(document.querySelector("#emptyTemplate").content.cloneNode(true));
    return;
  }

  visibleExpenses.forEach((expense) => {
    const item = document.createElement("article");
    item.className = "expense-item";
    item.innerHTML = `
      <div class="expense-main">
        <strong>${escapeHtml(expense.description)}</strong>
        <div class="expense-meta">${expense.category} · ${formatDate(expense.date)}</div>
      </div>
      <div>
        <div class="expense-amount">${money.format(expense.amount)}</div>
        <button class="delete-button" type="button" data-delete-id="${expense.id}" aria-label="Eliminar ${escapeHtml(expense.description)}">×</button>
      </div>
    `;
    elements.expenseList.append(item);
  });
}

function renderAnalytics(monthlyExpenses, total) {
  const byCategory = monthlyExpenses.reduce((groups, expense) => {
    groups[expense.category] = (groups[expense.category] || 0) + expense.amount;
    return groups;
  }, {});

  const rows = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1]);

  elements.categoryChart.innerHTML = "";
  elements.expenseCount.textContent = `${monthlyExpenses.length} gastos`;

  if (!rows.length) {
    elements.categoryChart.append(document.querySelector("#emptyTemplate").content.cloneNode(true));
    elements.monthlyInsight.textContent = "Cuando registres gastos, aquí verás la categoría que más pesa en tu mes.";
    return;
  }

  rows.forEach(([category, amount]) => {
    const percent = total ? Math.round((amount / total) * 100) : 0;
    const row = document.createElement("article");
    row.className = "chart-row";
    row.innerHTML = `
      <div class="chart-top">
        <span>${category}</span>
        <span>${money.format(amount)} · ${percent}%</span>
      </div>
      <div class="chart-bar" aria-label="${category}: ${percent}%">
        <span style="--bar-width: ${percent}%; --bar-color: ${CATEGORY_COLORS[category] || CATEGORY_COLORS.Otros}"></span>
      </div>
    `;
    elements.categoryChart.append(row);
  });

  const [topCategory, topAmount] = rows[0];
  elements.monthlyInsight.textContent = `${topCategory} concentra ${money.format(topAmount)} este mes. Ese es el mejor punto para revisar primero.`;
}

function renderTabs() {
  elements.tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === activeView);
  });

  Object.entries(elements.views).forEach(([view, element]) => {
    element.classList.toggle("active", view === activeView);
  });
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
    ["Fecha", "Categoría", "Descripción", "Monto"],
    ...rows
  ].map((row) => row.map(csvCell).join(",")).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `gastos-${selectedMonth}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function getMonthlyExpenses() {
  return state.expenses.filter((expense) => toMonthKey(parseDateInput(expense.date)) === selectedMonth);
}

function sumExpenses(expenses) {
  return expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
}

function loadState() {
  const fallback = { expenses: [], budgets: {} };
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      expenses: Array.isArray(stored?.expenses) ? stored.expenses : [],
      budgets: stored?.budgets && typeof stored.budgets === "object" ? stored.budgets : {}
    };
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

function formatDate(value) {
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short"
  }).format(new Date(`${value}T00:00:00`));
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
