(() => {
  "use strict";

  const KEYS = {
    draft: "bharanidharan-borewell-draft-v1",
    estimates: "bharanidharan-borewell-estimates-v1",
    templates: "bharanidharan-borewell-templates-v1",
  };
  const byId = (id) => document.getElementById(id);
  const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const integerFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
  const decimalFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
  let toastTimer;

  function localDate() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function makeId() {
    return globalThis.crypto?.randomUUID?.() || `row-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function blankSlab() { return { id: makeId(), from: "1", to: "", rate: "" }; }
  function initialState() {
    return {
      customerName: "", customerMobile: "", customerLocation: "", calculationDate: localDate(),
      totalDepth: "", slabs: [blankSlab()], casing7Feet: "", casing7Rate: "", casing10Feet: "", casing10Rate: "",
      expenses: [], advanceAmount: "0",
    };
  }

  function loadJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function normalizeState(value) {
    const base = initialState();
    if (!value || typeof value !== "object") return base;
    const textKeys = ["customerName", "customerMobile", "customerLocation", "calculationDate", "totalDepth", "casing7Feet", "casing7Rate", "casing10Feet", "casing10Rate", "advanceAmount"];
    for (const key of textKeys) if (typeof value[key] === "string") base[key] = value[key];
    if (Array.isArray(value.slabs)) {
      base.slabs = value.slabs.filter((row) => row && typeof row === "object").map((row) => ({
        id: typeof row.id === "string" ? row.id : makeId(),
        from: typeof row.from === "string" ? row.from : "",
        to: typeof row.to === "string" ? row.to : "",
        rate: typeof row.rate === "string" ? row.rate : "",
      }));
    }
    if (Array.isArray(value.expenses)) {
      base.expenses = value.expenses.filter((row) => row && typeof row === "object").map((row) => ({
        id: typeof row.id === "string" ? row.id : makeId(),
        description: typeof row.description === "string" ? row.description : "",
        amount: typeof row.amount === "string" ? row.amount : "",
      }));
    }
    if (!base.calculationDate) base.calculationDate = localDate();
    return base;
  }

  let state = normalizeState(loadJson(KEYS.draft, null));
  let savedEstimates = loadJson(KEYS.estimates, []);
  let savedTemplates = loadJson(KEYS.templates, []);
  if (!Array.isArray(savedEstimates)) savedEstimates = [];
  if (!Array.isArray(savedTemplates)) savedTemplates = [];

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function setFieldError(element, message) {
    if (!element) return;
    element.textContent = message || "";
    const field = element.closest(".field");
    const input = field?.querySelector("input");
    if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
  }

  function parseInteger(raw, minimum = 0) {
    const value = String(raw ?? "").trim();
    if (!/^\d+$/.test(value)) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= minimum ? number : null;
  }

  function parseDecimalHundredths(raw) {
    const value = String(raw ?? "").trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
    const [whole, fraction = ""] = value.split(".");
    const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    return Number.isSafeInteger(result) ? result : null;
  }

  function parseRupeesToPaise(raw) { return parseDecimalHundredths(raw); }
  function formatMoney(paise) { return paise == null ? "—" : INR.format(paise / 100); }
  function formatDepth(value) { return value == null ? "—" : integerFormat.format(value); }
  function formatFeetHundredths(hundredths) { return decimalFormat.format(hundredths / 100); }
  function sumSafe(values) {
    let total = 0;
    for (const value of values) {
      total += value;
      if (!Number.isSafeInteger(total)) return null;
    }
    return total;
  }

  function inspectSlabs(depth) {
    const rows = state.slabs.map((row, index) => {
      const from = parseInteger(row.from, 1);
      const to = parseInteger(row.to, 1);
      const rate = parseRupeesToPaise(row.rate);
      const errors = [];
      if (from == null) errors.push("Starting depth whole feet-la enter pannunga.");
      if (to == null) errors.push("Ending depth whole feet-la enter pannunga.");
      if (from != null && to != null && to < from) errors.push("End depth, start depth-ai vida kuraiva irukka koodadhu.");
      if (rate == null) errors.push("Rate enter pannunga (0 to 2 decimal places).");
      if (depth != null && from != null && from > depth) errors.push(`Start depth total ${formatDepth(depth)} ft-ai vida adhigam.`);
      if (depth != null && to != null && to > depth) errors.push(`End depth total ${formatDepth(depth)} ft-ai vida adhigam.`);
      const rangeValid = from != null && to != null && to >= from && (depth == null || (from <= depth && to <= depth));
      let feet = rangeValid ? to - from + 1 : null;
      let cost = rangeValid && rate != null ? rate * feet : null;
      if (cost != null && !Number.isSafeInteger(cost)) { errors.push("Indha slab amount romba perusu; rate-ai check pannunga."); cost = null; }
      return { row, index, from, to, rate, feet, cost, rangeValid, errors };
    });

    const intervals = rows.filter((row) => row.rangeValid).sort((a, b) => a.from - b.from || a.to - b.to);
    let overlap = false;
    let gap = false;
    const coverageMessages = [];
    if (depth == null) {
      coverageMessages.push("Motha depth enter pannina, slab coverage check pannuvom.");
    } else if (state.slabs.length === 0) {
      gap = true;
      coverageMessages.push(`Depth cover aagala: 1–${formatDepth(depth)} ft-ku slab serkkavum.`);
    } else {
      let expected = 1;
      let previous = null;
      for (const current of intervals) {
        if (current.from < expected) {
          overlap = true;
          current.errors.push(`Innum oru slab-oda overlap aagudhu (start ${formatDepth(expected)} ft-kku munnaadi).`);
          if (previous) previous.errors.push(`Innum oru slab-oda overlap aagudhu (${formatDepth(current.from)} ft-la).`);
        } else if (current.from > expected) {
          gap = true;
          const end = current.from - 1;
          coverageMessages.push(`${formatDepth(expected)}–${formatDepth(end)} ft range missing.`);
        }
        if (current.to >= expected) expected = current.to + 1;
        if (!previous || current.to > previous.to) previous = current;
      }
      if (expected <= depth) {
        gap = true;
        coverageMessages.push(`${formatDepth(expected)}–${formatDepth(depth)} ft range missing.`);
      }
      if (intervals.some((row) => row.to > depth)) gap = true;
      if (overlap && coverageMessages.length === 0) coverageMessages.push("Slab ranges overlap aagudhu. Range-ai maathunga.");
    }

    const allRowsValid = rows.length > 0 && rows.every((row) => row.rangeValid && row.rate != null && row.errors.length === 0);
    const sum = allRowsValid ? sumSafe(rows.map((row) => row.cost)) : null;
    const coverageComplete = depth != null && intervals.length === rows.length && !overlap && !gap && intervals.length > 0 && intervals[0].from === 1 && intervals[intervals.length - 1].to === depth;
    const complete = allRowsValid && coverageComplete && sum != null;
    if (complete) coverageMessages.splice(0, coverageMessages.length, "Slab ellam full depth-ai sariyaa cover pannudhu.");
    else if (!coverageMessages.length && rows.some((row) => row.errors.length)) coverageMessages.push("Slab details complete pannunga; appuram total calculate aagum.");
    else if (!coverageMessages.length && depth != null) coverageMessages.push("Full depth cover aagala. Slab start / end ranges-ai check pannunga.");
    return { rows, intervals, overlap, gap, messages: coverageMessages, total: complete ? sum : null, complete, allRowsValid };
  }

  function inspectCasing(feetRaw, rateRaw) {
    const feetText = String(feetRaw ?? "").trim();
    const rateText = String(rateRaw ?? "").trim();
    if (!feetText && !rateText) return { valid: true, total: 0, feet: null, rate: null, error: "" };
    if (!feetText || !rateText) return { valid: false, total: null, feet: null, rate: null, error: "Neelamum rate-um rendu field-um fill pannunga." };
    const feet = parseDecimalHundredths(feetText);
    const rate = parseRupeesToPaise(rateText);
    if (feet == null) return { valid: false, total: null, feet: null, rate: null, error: "Neelam 0-ukku mela; maximum 2 decimal places." };
    if (rate == null) return { valid: false, total: null, feet, rate: null, error: "Rate zero illa positive amount-a enter pannunga." };
    const exactTotal = (BigInt(feet) * BigInt(rate) + 50n) / 100n;
    if (exactTotal > BigInt(Number.MAX_SAFE_INTEGER)) return { valid: false, total: null, feet, rate, error: "Pipe amount romba perusu; values-ai check pannunga." };
    return { valid: true, total: Number(exactTotal), feet, rate, error: "" };
  }

  function inspectExpenses() {
    const rows = state.expenses.map((expense) => {
      const description = expense.description.trim();
      const amount = parseRupeesToPaise(expense.amount);
      const errors = [];
      if (!description) errors.push("Selavu vivaram enter pannunga.");
      if (amount == null) errors.push("Selavu thogai enter pannunga (0 to 2 decimal places).");
      return { expense, description, amount, errors };
    });
    const valid = rows.every((row) => row.errors.length === 0);
    const total = valid ? sumSafe(rows.map((row) => row.amount)) : null;
    return { rows, valid: valid && total != null, total: valid ? total : null };
  }

  function inspect() {
    const depth = parseInteger(state.totalDepth, 1);
    const slabs = inspectSlabs(depth);
    const casing7 = inspectCasing(state.casing7Feet, state.casing7Rate);
    const casing10 = inspectCasing(state.casing10Feet, state.casing10Rate);
    const expenses = inspectExpenses();
    const advanceText = String(state.advanceAmount ?? "").trim();
    const advance = advanceText ? parseRupeesToPaise(advanceText) : 0;
    const mobileDigits = state.customerMobile.replace(/\D/g, "");
    const mobileValid = !state.customerMobile.trim() || (/^[+\d\s()-]+$/.test(state.customerMobile.trim()) && mobileDigits.length >= 7 && mobileDigits.length <= 15);
    const partsValid = casing7.valid && casing10.valid && expenses.valid && advance != null && mobileValid;
    const ready = depth != null && slabs.complete && partsValid;
    const casingTotal = casing7.valid && casing10.valid ? sumSafe([casing7.total, casing10.total]) : null;
    const miscTotal = expenses.valid ? expenses.total : null;
    let grandTotal = null;
    if (ready && casingTotal != null && miscTotal != null) grandTotal = sumSafe([slabs.total, casingTotal, miscTotal]);
    const balance = grandTotal == null ? null : grandTotal - advance;
    return { depth, slabs, casing7, casing10, casingTotal, expenses, miscTotal, advance, mobileValid, ready: ready && grandTotal != null, grandTotal, balance };
  }

  function makeInput({ label, hint, type = "number", value = "", field, min, step, inputmode = "decimal", placeholder = "", maxlength }) {
    const wrapper = document.createElement("label");
    wrapper.className = "field";
    const title = document.createElement("span");
    title.append(document.createTextNode(label));
    if (hint) {
      const small = document.createElement("small");
      small.textContent = ` (${hint})`;
      title.append(small);
    }
    const input = document.createElement("input");
    input.type = type;
    input.value = value;
    input.dataset.field = field;
    if (min != null) input.min = String(min);
    if (step != null) input.step = String(step);
    if (inputmode) input.inputMode = inputmode;
    if (placeholder) input.placeholder = placeholder;
    if (maxlength) input.maxLength = maxlength;
    wrapper.append(title, input);
    return wrapper;
  }

  function renderSlabs() {
    const list = byId("slabsList");
    list.replaceChildren();
    state.slabs.forEach((slab, index) => {
      const card = document.createElement("article");
      card.className = "slab-card";
      card.dataset.slabId = slab.id;
      const top = document.createElement("div");
      top.className = "slab-card-top";
      const title = document.createElement("div");
      title.className = "slab-card-title";
      const number = document.createElement("span");
      number.className = "slab-index";
      number.textContent = String(index + 1).padStart(2, "0");
      const name = document.createElement("span");
      name.textContent = `RATE SLAB ${index + 1}`;
      title.append(number, name);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-button";
      remove.dataset.removeSlab = slab.id;
      remove.setAttribute("aria-label", `Remove slab ${index + 1}`);
      remove.title = "Remove slab";
      remove.textContent = "×";
      top.append(title, remove);

      const fields = document.createElement("div");
      fields.className = "slab-fields";
      fields.append(
        makeInput({ label: "Starting Depth", hint: "feet", value: slab.from, field: "from", min: 1, step: 1, inputmode: "numeric", placeholder: "1" }),
        makeInput({ label: "Ending Depth", hint: "feet", value: slab.to, field: "to", min: 1, step: 1, inputmode: "numeric", placeholder: "e.g. 100" }),
        makeInput({ label: "Oru Adikku Kattanam", hint: "₹ / feet", value: slab.rate, field: "rate", min: 0, step: 0.01, inputmode: "decimal", placeholder: "e.g. 100.00" }),
      );
      const result = document.createElement("div");
      result.className = "slab-result";
      result.dataset.slabResult = slab.id;
      const resultLabel = document.createElement("span");
      resultLabel.textContent = "Slab calculation";
      const resultValue = document.createElement("strong");
      resultValue.textContent = "—";
      result.append(resultLabel, resultValue);
      const message = document.createElement("p");
      message.className = "slab-message";
      message.dataset.slabMessage = slab.id;
      message.setAttribute("aria-live", "polite");
      card.append(top, fields, result, message);
      list.append(card);
    });
  }

  function renderExpenses() {
    const list = byId("expensesList");
    list.replaceChildren();
    state.expenses.forEach((expense, index) => {
      const row = document.createElement("div");
      row.className = "expense-row";
      row.dataset.expenseId = expense.id;
      const description = makeInput({ label: "Selavu Vivaram", type: "text", value: expense.description, field: "description", placeholder: "e.g. Transportation", maxlength: 80, inputmode: null });
      const amount = makeInput({ label: "Selavu Thogai", hint: "₹", value: expense.amount, field: "amount", min: 0, step: 0.01, inputmode: "decimal", placeholder: "0.00" });
      const descriptionError = document.createElement("small");
      descriptionError.className = "field-error";
      descriptionError.dataset.expenseError = "description";
      const amountError = document.createElement("small");
      amountError.className = "field-error";
      amountError.dataset.expenseError = "amount";
      description.append(descriptionError);
      amount.append(amountError);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-button";
      remove.dataset.removeExpense = expense.id;
      remove.setAttribute("aria-label", `Remove expense ${index + 1}`);
      remove.title = "Remove expense";
      remove.textContent = "×";
      row.append(description, amount, remove);
      list.append(row);
    });
  }

  function renderStateFields() {
    byId("customerName").value = state.customerName;
    byId("customerMobile").value = state.customerMobile;
    byId("customerLocation").value = state.customerLocation;
    byId("calculationDate").value = state.calculationDate || localDate();
    byId("totalDepth").value = state.totalDepth;
    byId("advanceAmount").value = state.advanceAmount;
    document.querySelector('[data-field="casing7Feet"]').value = state.casing7Feet;
    document.querySelector('[data-field="casing7Rate"]').value = state.casing7Rate;
    document.querySelector('[data-field="casing10Feet"]').value = state.casing10Feet;
    document.querySelector('[data-field="casing10Rate"]').value = state.casing10Rate;
    renderSlabs();
    renderExpenses();
  }

  function renderNamedOptions(select, rows, emptyLabel) {
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = emptyLabel;
    select.append(placeholder);
    rows.forEach((row) => {
      const option = document.createElement("option");
      option.value = row.id;
      option.textContent = row.name;
      select.append(option);
    });
  }

  function refreshSelectors() {
    renderNamedOptions(byId("savedEstimates"), savedEstimates, "Saved estimates");
    renderNamedOptions(byId("rateTemplates"), savedTemplates, "Template select pannunga");
    byId("openEstimateButton").disabled = !byId("savedEstimates").value;
    byId("applyTemplateButton").disabled = !byId("rateTemplates").value;
  }

  function updateSlabRows(calc) {
    calc.slabs.rows.forEach((row) => {
      const card = document.querySelector(`[data-slab-id="${CSS.escape(row.row.id)}"]`);
      if (!card) return;
      card.classList.toggle("is-invalid", row.errors.length > 0);
      const result = card.querySelector("[data-slab-result] strong");
      const resultLabel = card.querySelector("[data-slab-result] span");
      if (row.cost != null) {
        resultLabel.textContent = `${formatDepth(row.feet)} feet × ${formatMoney(row.rate)} / ft`;
        result.textContent = formatMoney(row.cost);
      } else {
        resultLabel.textContent = row.rangeValid ? "Slab calculation" : "Feet in slab × rate";
        result.textContent = "—";
      }
      card.querySelector("[data-slab-message]").textContent = row.errors[0] || "";
    });
  }

  function addSummarySlab(text, amount, pending = false) {
    const item = document.createElement("li");
    if (pending) item.className = "pending";
    const label = document.createElement("span");
    label.textContent = text;
    const value = document.createElement("strong");
    value.textContent = amount;
    item.append(label, value);
    byId("summarySlabs").append(item);
  }

  function renderPrintEstimate(calc) {
    const root = byId("printEstimate");
    root.replaceChildren();
    const header = document.createElement("header");
    header.className = "print-header";
    const brand = document.createElement("div");
    const title = document.createElement("div");
    title.className = "print-brand";
    title.textContent = "BHARANIDHARAN BOREWELL CALCULATOR";
    const sub = document.createElement("div");
    sub.className = "print-subtitle";
    sub.textContent = "Borewell cost estimate · Tamil Nadu";
    brand.append(title, sub);
    const meta = document.createElement("div");
    meta.className = "print-meta";
    meta.textContent = `Calculation date: ${state.calculationDate || "—"}\nBorewell depth: ${formatDepth(calc.depth)} feet`;
    meta.style.whiteSpace = "pre-line";
    header.append(brand, meta);
    root.append(header);

    const customer = document.createElement("div");
    customer.className = "print-customer";
    [["Customer", state.customerName || "—"], ["Mobile", state.customerMobile || "—"], ["Location", state.customerLocation || "—"]].forEach(([label, value]) => {
      const entry = document.createElement("div");
      const key = document.createElement("span");
      key.textContent = `${label}:`;
      const val = document.createElement("strong");
      val.textContent = value;
      entry.append(key, val);
      customer.append(entry);
    });
    root.append(customer);

    const sectionTitle = document.createElement("h2");
    sectionTitle.className = "print-section-title";
    sectionTitle.textContent = "Detailed Cost Breakdown";
    root.append(sectionTitle);
    const table = document.createElement("table");
    table.className = "print-table";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    ["Description", "Quantity / Rate", "Amount"].forEach((text) => { const th = document.createElement("th"); th.textContent = text; headRow.append(th); });
    thead.append(headRow);
    const tbody = document.createElement("tbody");
    const addLine = (description, quantity, amount, subtotal = false) => {
      const row = document.createElement("tr");
      if (subtotal) row.className = "print-subtotal";
      [description, quantity, amount].forEach((value, index) => { const cell = document.createElement("td"); cell.textContent = value; if (index === 2) cell.style.textAlign = "right"; row.append(cell); });
      tbody.append(row);
    };
    calc.slabs.rows.filter((row) => row.cost != null).forEach((row) => addLine(`Drilling charge (${formatDepth(row.from)}–${formatDepth(row.to)} ft)`, `${formatDepth(row.feet)} ft × ${formatMoney(row.rate)} / ft`, formatMoney(row.cost)));
    addLine("Total drilling charge", "", formatMoney(calc.slabs.total), true);
    if (calc.casing7.feet != null) addLine("7-Inch Casing Pipe", `${formatFeetHundredths(calc.casing7.feet)} ft × ${formatMoney(calc.casing7.rate)} / ft`, formatMoney(calc.casing7.total));
    if (calc.casing10.feet != null) addLine("10-Inch Casing Pipe", `${formatFeetHundredths(calc.casing10.feet)} ft × ${formatMoney(calc.casing10.rate)} / ft`, formatMoney(calc.casing10.total));
    calc.expenses.rows.forEach((row) => addLine(row.description || "Additional expense", "", formatMoney(row.amount)));
    tbody.append(document.createElement("tr"));
    table.append(thead, tbody);
    root.append(table);

    const totals = document.createElement("div");
    totals.className = "print-totals";
    const totalLine = (label, value, className = "") => {
      const line = document.createElement("div");
      line.className = `print-total-row ${className}`.trim();
      const left = document.createElement("span"); left.textContent = label;
      const right = document.createElement("strong"); right.textContent = value;
      line.append(left, right); totals.append(line);
    };
    totalLine("Grand Total", formatMoney(calc.grandTotal), "print-grand");
    totalLine("Advance received", `− ${formatMoney(calc.advance)}`);
    totalLine(calc.balance >= 0 ? "Meedhi Kudukka Vendiya Amount" : "Advance refund due", formatMoney(Math.abs(calc.balance)), "print-balance");
    root.append(totals);
    const footer = document.createElement("footer");
    footer.className = "print-footer";
    footer.textContent = "Thank you · Estimate prepared with Bharanidharan Borewell Calculator";
    root.append(footer);
  }

  function refresh() {
    const calc = inspect();
    setFieldError(byId("depthError"), state.totalDepth && calc.depth == null ? "Positive whole feet mattum enter pannunga." : "");
    setFieldError(byId("mobileError"), calc.mobileValid ? "" : "Valid mobile number enter pannunga (7–15 digits).");
    setFieldError(byId("casing7Error"), calc.casing7.error);
    setFieldError(byId("casing10Error"), calc.casing10.error);
    document.querySelectorAll(".pipe-card").forEach((card) => {
      const result = card.classList.contains("pipe-seven") ? calc.casing7 : calc.casing10;
      card.querySelectorAll(".field input").forEach((input) => input.setAttribute("aria-invalid", result.error ? "true" : "false"));
    });
    setFieldError(byId("advanceError"), String(state.advanceAmount).trim() && calc.advance == null ? "Zero illa positive amount; maximum 2 decimal places." : "");
    updateSlabRows(calc);

    const coverage = byId("slabCoverageStatus");
    coverage.textContent = calc.slabs.messages.join(" ");
    coverage.classList.toggle("is-valid", calc.slabs.complete);
    const depthOutput = byId("summaryDepth");
    depthOutput.replaceChildren();
    depthOutput.append(document.createTextNode(calc.depth == null ? "— " : `${formatDepth(calc.depth)} `));
    const depthUnit = document.createElement("small");
    depthUnit.textContent = "ft";
    depthOutput.append(depthUnit);

    const slabList = byId("summarySlabs");
    slabList.replaceChildren();
    calc.slabs.rows.forEach((row) => addSummarySlab(row.from != null && row.to != null ? `Drilling · ${formatDepth(row.from)}–${formatDepth(row.to)} ft` : `Drilling · Slab ${row.index + 1}`, row.cost == null ? "Pending" : formatMoney(row.cost), row.cost == null));

    byId("casing7Total").textContent = calc.casing7.total == null ? "—" : formatMoney(calc.casing7.total);
    byId("casing10Total").textContent = calc.casing10.total == null ? "—" : formatMoney(calc.casing10.total);
    byId("casingTotal").textContent = calc.casingTotal == null ? "—" : formatMoney(calc.casingTotal);
    byId("summaryCasing7").textContent = calc.casing7.total == null ? "—" : formatMoney(calc.casing7.total);
    byId("summaryCasing10").textContent = calc.casing10.total == null ? "—" : formatMoney(calc.casing10.total);

    const expensesValid = calc.expenses.valid;
    calc.expenses.rows.forEach((row) => {
      const card = document.querySelector(`[data-expense-id="${CSS.escape(row.expense.id)}"]`);
      if (!card) return;
      card.classList.toggle("is-invalid", row.errors.length > 0);
      card.querySelectorAll("input").forEach((input, index) => input.setAttribute("aria-invalid", row.errors[index] ? "true" : "false"));
      card.querySelector('[data-expense-error="description"]').textContent = row.errors.includes("Selavu vivaram enter pannunga.") ? "Selavu vivaram enter pannunga." : "";
      card.querySelector('[data-expense-error="amount"]').textContent = row.errors.find((message) => message.startsWith("Selavu thogai")) || "";
    });
    byId("miscTotal").textContent = calc.miscTotal == null ? "—" : formatMoney(calc.miscTotal);
    byId("summaryMisc").textContent = calc.miscTotal == null ? "—" : formatMoney(calc.miscTotal);
    byId("summaryGrand").textContent = calc.ready ? formatMoney(calc.grandTotal) : "—";
    byId("summaryAdvance").textContent = calc.advance == null ? "—" : formatMoney(calc.advance);

    const status = byId("summaryStatus");
    const statusText = status.querySelector("span:last-child");
    if (calc.ready) {
      status.className = "summary-status is-valid";
      statusText.textContent = "Kanakku complete · estimate ready";
    } else {
      status.className = `summary-status${(!calc.mobileValid || calc.advance == null || !calc.casing7.valid || !calc.casing10.valid || !calc.expenses.valid) ? " is-error" : ""}`;
      if (calc.depth == null) statusText.textContent = "Motha depth-ai enter pannunga";
      else if (!calc.slabs.complete) statusText.textContent = calc.slabs.overlap ? "Slab overlap irukku — range-ai sari pannunga" : "Slab range full depth-ai cover pannattum";
      else statusText.textContent = "Missing / invalid details-ai sari pannunga";
    }

    const balancePanel = byId("balancePanel");
    if (calc.ready) {
      const refund = calc.balance < 0;
      balancePanel.classList.toggle("is-refund", refund);
      byId("balanceLabel").textContent = refund ? "Customer-kku Thiruppi Kudukka Vendiya Amount" : "Meedhi Kudukka Vendiya Amount";
      byId("balanceNote").textContent = refund ? "Advance, motha selavai vida adhigam" : "Grand total-il advance kazhithadhu";
      byId("summaryBalance").textContent = formatMoney(Math.abs(calc.balance));
    } else {
      balancePanel.classList.remove("is-refund");
      byId("balanceLabel").textContent = "Meedhi Kudukka Vendiya Amount";
      byId("balanceNote").textContent = "Kanakku complete aana udane kaattuvom";
      byId("summaryBalance").textContent = "—";
    }

    byId("downloadPdfButton").disabled = !calc.ready;
    byId("printButton").disabled = !calc.ready;
    byId("shareButton").disabled = !calc.ready;
    byId("saveEstimateButton").disabled = !calc.ready;
    byId("saveTemplateButton").disabled = !calc.slabs.complete;
    if (calc.ready) renderPrintEstimate(calc);
    return calc;
  }

  function persistDraft() {
    try { localStorage.setItem(KEYS.draft, JSON.stringify(state)); }
    catch { showToast("Browser storage full-a irukku. Old estimates remove pannunga."); }
  }

  function showToast(message) {
    const toast = byId("toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
  }

  function persistList(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { showToast("Browser storage full-a irukku. Sila saved items remove pannunga."); return false; }
  }

  function saveEstimate() {
    const calc = refresh();
    if (!calc.ready) return;
    const name = window.prompt("Indha estimate-kku oru peyar kudunga:", state.customerName.trim() || `Borewell ${formatDepth(calc.depth)} ft`);
    if (name == null || !name.trim()) return;
    const estimate = { id: makeId(), name: name.trim().slice(0, 70), savedAt: new Date().toISOString(), state: clone(state) };
    const next = [estimate, ...savedEstimates.filter((row) => row.name !== estimate.name)].slice(0, 30);
    if (!persistList(KEYS.estimates, next)) return;
    savedEstimates = next;
    renderNamedOptions(byId("savedEstimates"), savedEstimates, "Saved estimates");
    byId("savedEstimates").value = estimate.id;
    refreshSelectors();
    byId("savedEstimates").value = estimate.id;
    byId("openEstimateButton").disabled = false;
    showToast(`“${estimate.name}” estimate indha browser-la save aachu.`);
  }

  function openEstimate() {
    const row = savedEstimates.find((item) => item.id === byId("savedEstimates").value);
    if (!row) return;
    state = normalizeState(row.state);
    renderStateFields();
    persistDraft();
    refresh();
    showToast(`“${row.name}” estimate open panniyachu.`);
  }

  function saveTemplate() {
    const calc = refresh();
    if (!calc.slabs.complete) return;
    const name = window.prompt("Rate template-kku peyar kudunga:", "Standard Borewell Rate");
    if (name == null || !name.trim()) return;
    const template = { id: makeId(), name: name.trim().slice(0, 70), depth: state.totalDepth, slabs: state.slabs.map(({ from, to, rate }) => ({ id: makeId(), from, to, rate })) };
    const next = [template, ...savedTemplates.filter((row) => row.name !== template.name)].slice(0, 30);
    if (!persistList(KEYS.templates, next)) return;
    savedTemplates = next;
    renderNamedOptions(byId("rateTemplates"), savedTemplates, "Template select pannunga");
    byId("rateTemplates").value = template.id;
    refreshSelectors();
    byId("rateTemplates").value = template.id;
    byId("applyTemplateButton").disabled = false;
    showToast(`“${template.name}” rate template save aachu.`);
  }

  function applyTemplate() {
    const template = savedTemplates.find((item) => item.id === byId("rateTemplates").value);
    if (!template) return;
    state.totalDepth = String(template.depth || "");
    state.slabs = template.slabs.map((row) => ({ id: makeId(), from: String(row.from), to: String(row.to), rate: String(row.rate) }));
    renderStateFields();
    persistDraft();
    refresh();
    showToast(`“${template.name}” rates apply panniyachu.`);
  }

  function newCalculation() {
    if (!window.confirm("Current kanakkai clear panni pudhiya kanakku start pannalama?")) return;
    state = initialState();
    try { localStorage.removeItem(KEYS.draft); } catch { /* storage can be disabled */ }
    byId("savedEstimates").value = "";
    byId("rateTemplates").value = "";
    renderStateFields();
    refreshSelectors();
    refresh();
    showToast("Pudhiya kanakku ready.");
  }

  function estimateMessage(calc) {
    const lines = ["*BHARANIDHARAN BOREWELL CALCULATOR*", `Borewell depth: ${formatDepth(calc.depth)} feet`];
    if (state.customerName.trim()) lines.push(`Customer: ${state.customerName.trim()}`);
    if (state.customerMobile.trim()) lines.push(`Mobile: ${state.customerMobile.trim()}`);
    if (state.customerLocation.trim()) lines.push(`Location: ${state.customerLocation.trim()}`);
    lines.push("", "*Drilling breakdown*");
    calc.slabs.rows.forEach((row) => lines.push(`${formatDepth(row.from)}–${formatDepth(row.to)} ft · ${formatMoney(row.rate)}/ft = ${formatMoney(row.cost)}`));
    lines.push(`Drilling total: ${formatMoney(calc.slabs.total)}`);
    if (calc.casing7.feet != null) lines.push(`7-inch casing (${formatFeetHundredths(calc.casing7.feet)} ft): ${formatMoney(calc.casing7.total)}`);
    if (calc.casing10.feet != null) lines.push(`10-inch casing (${formatFeetHundredths(calc.casing10.feet)} ft): ${formatMoney(calc.casing10.total)}`);
    calc.expenses.rows.forEach((row) => lines.push(`${row.description}: ${formatMoney(row.amount)}`));
    lines.push(`*Grand total: ${formatMoney(calc.grandTotal)}*`, `Advance received: −${formatMoney(calc.advance)}`);
    lines.push(calc.balance >= 0 ? `*Balance due: ${formatMoney(calc.balance)}*` : `*Refund due: ${formatMoney(Math.abs(calc.balance))}*`);
    return lines.join("\n");
  }

  function shareEstimate() {
    const calc = refresh();
    if (!calc.ready) return;
    const url = `https://wa.me/?text=${encodeURIComponent(estimateMessage(calc))}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function printEstimate() {
    const calc = refresh();
    if (!calc.ready) return;
    window.print();
  }

  function downloadPdf() {
    const calc = refresh();
    if (!calc.ready) return;
    showToast("Print dialog open aagum. Destination-la ‘Save as PDF’ select pannunga.");
    window.print();
  }

  function handleInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.id) {
      const keys = { customerName: "customerName", customerMobile: "customerMobile", customerLocation: "customerLocation", calculationDate: "calculationDate", totalDepth: "totalDepth", advanceAmount: "advanceAmount" };
      if (keys[target.id]) state[keys[target.id]] = target.value;
    } else if (target.closest(".slab-card") && target.dataset.field) {
      const slabId = target.closest(".slab-card").dataset.slabId;
      const row = state.slabs.find((slab) => slab.id === slabId);
      if (row) row[target.dataset.field] = target.value;
    } else if (target.closest(".expense-row") && target.dataset.field) {
      const expenseId = target.closest(".expense-row").dataset.expenseId;
      const row = state.expenses.find((expense) => expense.id === expenseId);
      if (row) row[target.dataset.field] = target.value;
    } else if (target.dataset.field && Object.hasOwn(state, target.dataset.field)) {
      state[target.dataset.field] = target.value;
    }

    if (target.id === "totalDepth" && state.slabs.length === 1 && state.slabs[0].from === "1" && !state.slabs[0].to && parseInteger(state.totalDepth, 1) != null) {
      state.slabs[0].to = state.totalDepth;
      renderSlabs();
    }
    persistDraft();
    refresh();
  }

  function handleClick(event) {
    const target = event.target.closest("button");
    if (!target) return;
    if (target.id === "addSlabButton") {
      const priorEnds = state.slabs.map((row) => parseInteger(row.to, 1)).filter((value) => value != null);
      const nextFrom = priorEnds.length ? String(Math.max(...priorEnds) + 1) : "1";
      state.slabs.push({ id: makeId(), from: nextFrom, to: "", rate: "" });
      renderSlabs(); persistDraft(); refresh();
    } else if (target.dataset.removeSlab) {
      state.slabs = state.slabs.filter((row) => row.id !== target.dataset.removeSlab);
      renderSlabs(); persistDraft(); refresh();
    } else if (target.id === "addExpenseButton") {
      state.expenses.push({ id: makeId(), description: "", amount: "" });
      renderExpenses(); persistDraft(); refresh();
      byId("expensesList").lastElementChild?.querySelector("input")?.focus();
    } else if (target.dataset.removeExpense) {
      state.expenses = state.expenses.filter((row) => row.id !== target.dataset.removeExpense);
      renderExpenses(); persistDraft(); refresh();
    } else if (target.id === "saveEstimateButton") saveEstimate();
    else if (target.id === "openEstimateButton") openEstimate();
    else if (target.id === "saveTemplateButton") saveTemplate();
    else if (target.id === "applyTemplateButton") applyTemplate();
    else if (target.id === "newCalculationButton") newCalculation();
    else if (target.id === "downloadPdfButton") downloadPdf();
    else if (target.id === "printButton") printEstimate();
    else if (target.id === "shareButton") shareEstimate();
  }

  function bind() {
    byId("calculatorForm").addEventListener("input", handleInput);
    byId("calculatorForm").addEventListener("change", handleInput);
    byId("calculatorForm").addEventListener("submit", (event) => event.preventDefault());
    document.addEventListener("click", handleClick);
    byId("savedEstimates").addEventListener("change", () => { byId("openEstimateButton").disabled = !byId("savedEstimates").value; });
    byId("rateTemplates").addEventListener("change", () => { byId("applyTemplateButton").disabled = !byId("rateTemplates").value; });
    renderStateFields();
    refreshSelectors();
    refresh();
  }

  bind();
})();
