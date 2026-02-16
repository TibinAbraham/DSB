const apiBase = window.API_BASE || "";
const currentUser = () =>
  sessionStorage.getItem("currentUser")
    ? JSON.parse(sessionStorage.getItem("currentUser"))
    : { employeeId: "SYSTEM" };

const chargeMonthVendor = document.querySelector("#charge-month-vendor");
const chargeMonthCustomer = document.querySelector("#charge-month-customer");
const computeVendorBtn = document.querySelector("#compute-vendor-btn");
const computeCustomerBtn = document.querySelector("#compute-customer-btn");
const refreshVendorBtn = document.querySelector("#refresh-vendor");
const refreshCustomerBtn = document.querySelector("#refresh-customer");
const chargeVendorMessage = document.querySelector("#charge-vendor-message");
const chargeCustomerMessage = document.querySelector("#charge-customer-message");
const vendorRows = document.querySelector("#vendor-charge-rows");
const customerRows = document.querySelector("#customer-charge-rows");
const vendorChargeMessage = document.querySelector("#vendor-charge-message");
const customerChargeMessage = document.querySelector("#customer-charge-message");

const postJson = async (url, payload) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || response.statusText || "Request failed");
  }
  return response.json();
};

const setMessage = (el, text, isError = false) => {
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? "#b42318" : "#0f4c81";
};

const formatCurrency = (n) => {
  if (n == null || n === "") return "";
  const num = Number(n);
  return Number.isNaN(num) ? "" : num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
};

const initMonth = (el) => {
  if (!el || el.value) return;
  const now = new Date();
  el.value = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const loadVendorCharges = async (monthKey) => {
  if (!vendorRows) return;
  vendorRows.innerHTML = "";
  vendorChargeMessage.textContent = "";
  try {
    const url = monthKey
      ? `${apiBase}/api/charges/vendor/summary?month_key=${encodeURIComponent(monthKey)}`
      : `${apiBase}/api/charges/vendor/summary`;
    const response = await fetch(url, { headers: window.getAuthHeaders() });
    if (!response.ok) throw new Error("Failed to load vendor charges");
    const data = await response.json();
    if (!data.length) {
      vendorChargeMessage.textContent = "No vendor charges found. Select a month and compute.";
      return;
    }
    vendorRows.innerHTML = data
      .map(
        (r) => `
      <tr>
        <td>${r.vendor_name || r.vendor_code || r.vendor_id}</td>
        <td>${r.month_key || ""}</td>
        <td>${r.beat_pickups ?? ""}</td>
        <td>${r.call_pickups ?? ""}</td>
        <td>${formatCurrency(r.base_charge_amount)}</td>
        <td>${formatCurrency(r.enhancement_charge)}</td>
        <td>${formatCurrency(r.tax_amount)}</td>
        <td>${formatCurrency(r.total_with_tax)}</td>
        <td>${r.computed_by || ""}</td>
      </tr>
    `,
      )
      .join("");
  } catch (error) {
    vendorChargeMessage.textContent = error.message || "Unable to load vendor charges.";
    vendorChargeMessage.style.color = "#b42318";
  }
};

const loadCustomerCharges = async (monthKey) => {
  if (!customerRows) return;
  customerRows.innerHTML = "";
  customerChargeMessage.textContent = "";
  try {
    const url = monthKey
      ? `${apiBase}/api/charges/customer/summary?month_key=${encodeURIComponent(monthKey)}`
      : `${apiBase}/api/charges/customer/summary`;
    const response = await fetch(url, { headers: window.getAuthHeaders() });
    if (!response.ok) throw new Error("Failed to load customer charges");
    const data = await response.json();
    if (!data.length) {
      customerChargeMessage.textContent = "No customer charges found. Select a month and compute.";
      return;
    }
    customerRows.innerHTML = data
      .map(
        (r) => `
      <tr>
        <td>${r.customer_id || ""}</td>
        <td>${r.month_key || ""}</td>
        <td>${formatCurrency(r.total_remittance)}</td>
        <td>${formatCurrency(r.base_charge_amount)}</td>
        <td>${formatCurrency(r.enhancement_charge)}</td>
        <td>${formatCurrency(r.waiver_amount)}</td>
        <td>${formatCurrency(r.net_charge_amount)}</td>
        <td>${formatCurrency(r.total_with_tax)}</td>
        <td>${r.computed_by || ""}</td>
      </tr>
    `,
      )
      .join("");
  } catch (error) {
    customerChargeMessage.textContent = error.message || "Unable to load customer charges.";
    customerChargeMessage.style.color = "#b42318";
  }
};

const computeCharges = async (type) => {
  const monthEl = type === "vendor" ? chargeMonthVendor : chargeMonthCustomer;
  const msgEl = type === "vendor" ? chargeVendorMessage : chargeCustomerMessage;
  const month = monthEl?.value?.trim();
  if (!month || month.length !== 6) {
    setMessage(msgEl, "Enter a valid month (YYYYMM, e.g. 202501)", true);
    return;
  }
  setMessage(msgEl, `Computing ${type} charges...`);
  try {
    const response = await fetch(`${apiBase}/api/charges/${type}/compute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
      body: JSON.stringify({ month_key: month }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || response.statusText || "Compute failed");
    setMessage(msgEl, `${type} charges computed: ${data.computed ?? 0} records.`);
    if (type === "vendor") loadVendorCharges(month);
    else loadCustomerCharges(month);
  } catch (error) {
    setMessage(msgEl, error.message || "Compute failed", true);
  }
};

const loadVendors = async (selectIds) => {
  const ids = Array.isArray(selectIds) ? selectIds : [selectIds];
  const selects = ids.map((id) => document.querySelector(id)).filter(Boolean);
  if (!selects.length) return;
  try {
    const response = await fetch(`${apiBase}/api/vendors`, { headers: window.getAuthHeaders() });
    if (!response.ok) return;
    const vendors = await response.json();
    const active = vendors.filter((v) => v.status === "ACTIVE");
    selects.forEach((sel) => {
      const isFilter = sel.id === "slab-filter-vendor";
      sel.innerHTML = isFilter
        ? '<option value="">All vendors</option>'
        : '<option value="">Select vendor</option>';
      active.forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v.vendor_id;
        opt.textContent = `${v.name || ""} (${v.code || ""})`.trim() || v.vendor_id;
        sel.appendChild(opt);
      });
    });
  } catch (e) {}
};

const loadCustomerSlabs = async (vendorId) => {
  const rows = document.querySelector("#customer-slab-rows");
  if (!rows) return;
  try {
    const url = vendorId
      ? `${apiBase}/api/customer-charge-slabs?vendor_id=${vendorId}`
      : `${apiBase}/api/customer-charge-slabs`;
    const response = await fetch(url, { headers: window.getAuthHeaders() });
    if (!response.ok) return;
    const data = await response.json();
    rows.innerHTML = data
      .map(
        (r) => `
      <tr>
        <td>${r.vendor_name || r.vendor_code || r.vendor_id}</td>
        <td>${Number(r.amount_from).toLocaleString()}</td>
        <td>${Number(r.amount_to).toLocaleString()}</td>
        <td>${Number(r.charge_amount).toLocaleString()}</td>
        <td>${r.slab_label || ""}</td>
      </tr>
    `,
      )
      .join("");
  } catch (e) {
    rows.innerHTML = "<tr><td colspan='5'>Unable to load slabs</td></tr>";
  }
};

const bindForm = (formId, messageId, handler) => {
  const form = document.querySelector(formId);
  const message = document.querySelector(messageId);
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (message) message.textContent = "Submitting...";
    try {
      await handler(new FormData(form));
      if (message) message.textContent = "Request submitted for approval.";
      form.reset();
    } catch (error) {
      if (message) {
        message.textContent = error.message || "Request failed.";
        message.style.color = "#b42318";
      }
    }
  });
};

document.querySelectorAll(".charge-tab").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const tab = btn.dataset.tab;
    document.querySelectorAll(".charge-tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".charge-panel").forEach((p) => {
      p.classList.toggle("hidden", p.id !== `${tab}-panel`);
    });
    btn.classList.add("active");
    window.location.hash = tab;
    return false;
  });
});

// Restore tab from URL hash on load
const hash = window.location.hash.replace("#", "");
if (hash === "customer") {
  document.querySelectorAll(".charge-tab").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".charge-panel").forEach((p) => {
    p.classList.toggle("hidden", p.id !== "customer-panel");
  });
  document.querySelector(".charge-tab[data-tab='customer']")?.classList.add("active");
}

if (computeVendorBtn) computeVendorBtn.addEventListener("click", () => computeCharges("vendor"));
if (computeCustomerBtn) computeCustomerBtn.addEventListener("click", () => computeCharges("customer"));
if (refreshVendorBtn) refreshVendorBtn.addEventListener("click", () => loadVendorCharges(chargeMonthVendor?.value?.trim() || null));
if (refreshCustomerBtn) refreshCustomerBtn.addEventListener("click", () => loadCustomerCharges(chargeMonthCustomer?.value?.trim() || null));

bindForm("#vendor-charge-form", "#vendor-charge-form-message", async (data) => {
  await postJson(`${apiBase}/api/vendor-charges/requests`, {
    vendor_id: Number(data.get("vendorId")),
    pickup_type: data.get("pickupType"),
    base_charge: Number(data.get("baseCharge")),
    effective_from: data.get("effectiveFrom"),
    status: "ACTIVE",
    maker_id: currentUser().employeeId,
  });
});

bindForm("#pickup-rule-form", "#pickup-rule-message", async (data) => {
  await postJson(`${apiBase}/api/pickup-rules/requests`, {
    pickup_type: data.get("pickupType"),
    free_limit: data.get("freeLimit") ? Number(data.get("freeLimit")) : null,
    effective_from: data.get("effectiveFrom"),
    status: "ACTIVE",
    maker_id: currentUser().employeeId,
  });
});

bindForm("#customer-slab-form", "#customer-slab-message", async (data) => {
  await postJson(`${apiBase}/api/customer-charge-slabs`, {
    vendor_id: Number(data.get("vendorId")),
    amount_from: Number(data.get("amountFrom")),
    amount_to: Number(data.get("amountTo")),
    charge_amount: Number(data.get("chargeAmount")),
    slab_label: data.get("slabLabel") || "",
    effective_from: data.get("effectiveFrom"),
  });
  loadCustomerSlabs(document.querySelector("#slab-filter-vendor")?.value || null);
});

bindForm("#charge-config-form", "#charge-config-message", async (data) => {
  await postJson(`${apiBase}/api/charge-configs/requests`, {
    config_code: data.get("configCode"),
    config_name: data.get("configName"),
    value_number: data.get("valueNumber") ? Number(data.get("valueNumber")) : null,
    value_text: data.get("valueText") || null,
    effective_from: data.get("effectiveFrom"),
    status: "ACTIVE",
    maker_id: currentUser().employeeId,
  });
});

bindForm("#waiver-form", "#waiver-message", async (data) => {
  await postJson(`${apiBase}/api/waivers/requests`, {
    customer_id: data.get("customerId"),
    waiver_type: data.get("waiverType"),
    waiver_percentage: data.get("waiverPercentage") ? Number(data.get("waiverPercentage")) : null,
    waiver_cap_amount: data.get("waiverCapAmount") ? Number(data.get("waiverCapAmount")) : null,
    waiver_from: data.get("waiverFrom"),
    waiver_to: data.get("waiverTo") || null,
    status: "ACTIVE",
    maker_id: currentUser().employeeId,
  });
});

initMonth(chargeMonthVendor);
initMonth(chargeMonthCustomer);
loadVendorCharges(chargeMonthVendor?.value?.trim() || null);
loadCustomerCharges(chargeMonthCustomer?.value?.trim() || null);
loadVendors(["#vendor-charge-vendor", "#slab-vendor", "#slab-filter-vendor"]);
loadCustomerSlabs();

document.querySelector("#slab-filter-vendor")?.addEventListener("change", () => {
  loadCustomerSlabs(document.querySelector("#slab-filter-vendor").value || null);
});
