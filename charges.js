const apiBase = window.API_BASE || "";
const currentUser = () =>
  sessionStorage.getItem("currentUser")
    ? JSON.parse(sessionStorage.getItem("currentUser"))
    : { employeeId: "SYSTEM" };

const chargeDateFromVendor = document.querySelector("#charge-date-from-vendor");
const chargeDateToVendor = document.querySelector("#charge-date-to-vendor");
const chargeDateFromCustomer = document.querySelector("#charge-date-from-customer");
const chargeDateToCustomer = document.querySelector("#charge-date-to-customer");
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

const dateToMonthKey = (val) => (val && val.length >= 7 ? val.slice(0, 7).replace(/-/g, "") : null);

const getMonthsInRange = (monthFrom, monthTo) => {
  if (!monthFrom || !monthTo) return monthFrom ? [monthFrom] : [];
  const [from, to] = monthFrom <= monthTo ? [monthFrom, monthTo] : [monthTo, monthFrom];
  const months = [];
  const [yFrom, mFrom] = [parseInt(from.slice(0, 4), 10), parseInt(from.slice(4, 6), 10)];
  const [yTo, mTo] = [parseInt(to.slice(0, 4), 10), parseInt(to.slice(4, 6), 10)];
  for (let y = yFrom; y <= yTo; y++) {
    const mStart = y === yFrom ? mFrom : 1;
    const mEnd = y === yTo ? mTo : 12;
    for (let m = mStart; m <= mEnd; m++) {
      months.push(`${y}${String(m).padStart(2, "0")}`);
    }
  }
  return months;
};

const initDate = (el) => {
  if (!el || el.value) return;
  const now = new Date();
  el.value = now.toISOString().slice(0, 10);
};

const loadVendorCharges = async (monthFrom, monthTo) => {
  if (!vendorRows) return;
  vendorRows.innerHTML = "";
  vendorChargeMessage.textContent = "";
  try {
    let url = `${apiBase}/api/charges/vendor/summary`;
    if (monthFrom && monthTo) {
      const [from, to] = monthFrom <= monthTo ? [monthFrom, monthTo] : [monthTo, monthFrom];
      url += `?month_from=${encodeURIComponent(from)}&month_to=${encodeURIComponent(to)}`;
    } else if (monthFrom) {
      url += `?month_key=${encodeURIComponent(monthFrom)}`;
    }
    const response = await fetch(url, { headers: window.getAuthHeaders() });
    if (!response.ok) throw new Error("Failed to load vendor charges");
    const data = await response.json();
    if (!data.length) {
      vendorChargeMessage.textContent = "No vendor charges found. Select dates and compute.";
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

const loadCustomerCharges = async (monthFrom, monthTo) => {
  if (!customerRows) return;
  customerRows.innerHTML = "";
  customerChargeMessage.textContent = "";
  try {
    let url = `${apiBase}/api/charges/customer/summary`;
    if (monthFrom && monthTo) {
      const [from, to] = monthFrom <= monthTo ? [monthFrom, monthTo] : [monthTo, monthFrom];
      url += `?month_from=${encodeURIComponent(from)}&month_to=${encodeURIComponent(to)}`;
    } else if (monthFrom) {
      url += `?month_key=${encodeURIComponent(monthFrom)}`;
    }
    const response = await fetch(url, { headers: window.getAuthHeaders() });
    if (!response.ok) throw new Error("Failed to load customer charges");
    const data = await response.json();
    if (!data.length) {
      customerChargeMessage.textContent = "No customer charges found. Select dates and compute.";
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
  const fromEl = type === "vendor" ? chargeDateFromVendor : chargeDateFromCustomer;
  const toEl = type === "vendor" ? chargeDateToVendor : chargeDateToCustomer;
  const msgEl = type === "vendor" ? chargeVendorMessage : chargeCustomerMessage;
  const fromVal = fromEl?.value?.trim();
  const toVal = toEl?.value?.trim();
  const monthFrom = dateToMonthKey(fromVal);
  const monthTo = dateToMonthKey(toVal) || monthFrom;
  if (!monthFrom || monthFrom.length !== 6) {
    setMessage(msgEl, "Select From Date to compute charges", true);
    return;
  }
  const months = getMonthsInRange(monthFrom, monthTo);
  setMessage(msgEl, `Computing ${type} charges for ${months.length} month(s)...`);
  try {
    let totalComputed = 0;
    for (const monthKey of months) {
      const response = await fetch(`${apiBase}/api/charges/${type}/compute`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
        body: JSON.stringify({ month_key: monthKey }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || response.statusText || "Compute failed");
      totalComputed += data.computed ?? 0;
    }
    setMessage(msgEl, `${type} charges computed: ${totalComputed} records across ${months.length} month(s).`);
    if (type === "vendor") loadVendorCharges(monthFrom, monthTo);
    else loadCustomerCharges(monthFrom, monthTo);
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
      const isViewConfig = sel.id === "vendor-charge-view-vendor";
      sel.innerHTML = isFilter
        ? '<option value="">All vendors</option>'
        : isViewConfig
          ? '<option value="">Select vendor to view configuration</option>'
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

const loadVendorChargeConfig = async (vendorId) => {
  const rows = document.querySelector("#vendor-charge-config-rows");
  const message = document.querySelector("#vendor-charge-config-message");
  if (!rows) return;
  rows.innerHTML = "";
  if (message) message.textContent = "";
  if (!vendorId) return;
  try {
    const response = await fetch(
      `${apiBase}/api/vendor-charges?vendor_id=${encodeURIComponent(vendorId)}&include_inactive=true`,
      { headers: window.getAuthHeaders() },
    );
    if (!response.ok) throw new Error("Failed to load configuration");
    const data = await response.json();
    if (!data.length) {
      if (message) message.textContent = "No charge configuration found for this vendor.";
      return;
    }
    rows.innerHTML = data
      .map(
        (r) => `
      <tr>
        <td>${r.pickup_type || ""}</td>
        <td>${formatCurrency(r.base_charge)}</td>
        <td>${r.effective_from || ""}</td>
        <td>${r.effective_to || "-"}</td>
        <td><span class="status ${r.status === "ACTIVE" ? "match" : "pending"}">${r.status || ""}</span></td>
      </tr>
    `,
      )
      .join("");
  } catch (error) {
    if (message) {
      message.textContent = error.message || "Unable to load configuration.";
      message.style.color = "#b42318";
    }
  }
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
if (refreshVendorBtn)
  refreshVendorBtn.addEventListener("click", () => {
    const from = dateToMonthKey(chargeDateFromVendor?.value?.trim());
    const to = dateToMonthKey(chargeDateToVendor?.value?.trim()) || from;
    loadVendorCharges(from, to);
  });
if (refreshCustomerBtn)
  refreshCustomerBtn.addEventListener("click", () => {
    const from = dateToMonthKey(chargeDateFromCustomer?.value?.trim());
    const to = dateToMonthKey(chargeDateToCustomer?.value?.trim()) || from;
    loadCustomerCharges(from, to);
  });

bindForm("#vendor-charge-form", "#vendor-charge-form-message", async (data) => {
  await postJson(`${apiBase}/api/vendor-charges/requests`, {
    vendor_id: Number(data.get("vendorId")),
    pickup_type: data.get("pickupType"),
    base_charge: Number(data.get("baseCharge")),
    effective_from: data.get("effectiveFrom"),
    status: "ACTIVE",
    maker_id: currentUser().employeeId,
  });
  const viewVendor = document.querySelector("#vendor-charge-view-vendor")?.value;
  if (viewVendor) loadVendorChargeConfig(viewVendor);
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

initDate(chargeDateFromVendor);
initDate(chargeDateToVendor);
initDate(chargeDateFromCustomer);
initDate(chargeDateToCustomer);
const vendorFrom = dateToMonthKey(chargeDateFromVendor?.value?.trim());
const vendorTo = dateToMonthKey(chargeDateToVendor?.value?.trim()) || vendorFrom;
const customerFrom = dateToMonthKey(chargeDateFromCustomer?.value?.trim());
const customerTo = dateToMonthKey(chargeDateToCustomer?.value?.trim()) || customerFrom;
loadVendorCharges(vendorFrom, vendorTo);
loadCustomerCharges(customerFrom, customerTo);
loadVendors(["#vendor-charge-vendor", "#slab-vendor", "#slab-filter-vendor", "#vendor-charge-view-vendor"]);

document.querySelector("#vendor-charge-view-vendor")?.addEventListener("change", (e) => {
  const vendorId = e.target.value;
  loadVendorChargeConfig(vendorId || null);
});
loadCustomerSlabs();

document.querySelector("#slab-filter-vendor")?.addEventListener("change", () => {
  loadCustomerSlabs(document.querySelector("#slab-filter-vendor").value || null);
});
