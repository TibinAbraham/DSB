const reportMessage = document.querySelector("#report-message");
const vendorReportForm = document.querySelector("#vendor-report-form");
const vendorSelect = document.querySelector("#vendor-report-select");
const vendorFromInput = document.querySelector("#vendor-report-from");
const vendorToInput = document.querySelector("#vendor-report-to");
const vendorPreviewButton = document.querySelector("#vendor-report-preview");
const vendorPreviewTable = document.querySelector("#vendor-report-preview-table");
const customerReportForm = document.querySelector("#customer-report-form");
const customerSelect = document.querySelector("#customer-report-select");
const customerFromInput = document.querySelector("#customer-report-from");
const customerToInput = document.querySelector("#customer-report-to");
const customerPreviewButton = document.querySelector("#customer-report-preview");
const customerPreviewTable = document.querySelector("#customer-report-preview-table");
const reconReportForm = document.querySelector("#recon-report-form");
const reconFromInput = document.querySelector("#recon-report-from");
const reconToInput = document.querySelector("#recon-report-to");
const reconPreviewButton = document.querySelector("#recon-report-preview");
const reconPreviewTable = document.querySelector("#recon-report-preview-table");
const apiBase = window.API_BASE || "";

const triggerDownload = async (reportKey) => {
  reportMessage.textContent = "Preparing report...";
  reportMessage.style.color = "#0f4c81";

  try {
    const response = await fetch(`${apiBase}/api/reports/${reportKey}`, {
      headers: window.getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error("Report failed");
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    link.download = match ? match[1] : `${reportKey}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
    reportMessage.textContent = "Report downloaded.";
  } catch (error) {
    reportMessage.textContent = "Unable to download report.";
    reportMessage.style.color = "#b42318";
  }
};

document.querySelectorAll("[data-report]").forEach((button) => {
  button.addEventListener("click", () => {
    triggerDownload(button.dataset.report);
  });
});

const loadVendors = async () => {
  if (!vendorSelect) return;
  vendorSelect.innerHTML = "";
  try {
    const response = await fetch(`${apiBase}/api/vendors`, {
      headers: window.getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error("Failed to load vendors");
    }
    const vendors = await response.json();
    vendors.forEach((vendor) => {
      const option = document.createElement("option");
      option.value = vendor.vendor_id;
      option.textContent = `${vendor.name} (${vendor.code})`;
      vendorSelect.appendChild(option);
    });
  } catch (error) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Unable to load vendors";
    vendorSelect.appendChild(option);
  }
};

const loadCustomers = async () => {
  if (!customerSelect) return;
  customerSelect.innerHTML = "";
  try {
    const response = await fetch(`${apiBase}/api/reports/customers`, {
      headers: window.getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error("Failed to load customers");
    }
    const customers = await response.json();
    customers.forEach((customer) => {
      const option = document.createElement("option");
      option.value = customer.customer_id;
      option.textContent = customer.customer_name
        ? `${customer.customer_name} (${customer.customer_id})`
        : customer.customer_id;
      customerSelect.appendChild(option);
    });
  } catch (error) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Unable to load customers";
    customerSelect.appendChild(option);
  }
};

const downloadVendorReport = async (event) => {
  event.preventDefault();
  const vendorId = vendorSelect?.value;
  const fromDate = vendorFromInput?.value;
  const toDate = vendorToInput?.value;
  if (!vendorId || !fromDate || !toDate) {
    reportMessage.textContent = "Select vendor and date range.";
    reportMessage.style.color = "#b42318";
    return;
  }

  reportMessage.textContent = "Preparing vendor report...";
  reportMessage.style.color = "#0f4c81";
  try {
    const response = await fetch(
      `${apiBase}/api/reports/vendor-pickups?vendor_id=${encodeURIComponent(
        vendorId,
      )}&from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(toDate)}`,
      { headers: window.getAuthHeaders() },
    );
    if (!response.ok) {
      throw new Error("Report failed");
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vendor-pickups_${vendorId}_${fromDate}_${toDate}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
    reportMessage.textContent = "Vendor report downloaded.";
  } catch (error) {
    reportMessage.textContent = "Unable to download vendor report.";
    reportMessage.style.color = "#b42318";
  }
};

const renderPreviewTable = (container, rows) => {
  if (!container) return;
  if (!rows.length) {
    container.innerHTML = "<p class=\"form-message\">No data found.</p>";
    return;
  }
  const headers = Object.keys(rows[0]);
  const bodyRows = rows
    .map(
      (row) =>
        `<tr>${headers.map((key) => `<td>${row[key] ?? ""}</td>`).join("")}</tr>`,
    )
    .join("");
  container.innerHTML = `
    <table>
      <thead>
        <tr>${headers.map((key) => `<th>${key}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${bodyRows}
      </tbody>
    </table>
  `;
};

const previewVendorReport = async () => {
  const vendorId = vendorSelect?.value;
  const fromDate = vendorFromInput?.value;
  const toDate = vendorToInput?.value;
  if (!vendorId || !fromDate || !toDate) {
    reportMessage.textContent = "Select vendor and date range.";
    reportMessage.style.color = "#b42318";
    return;
  }
  reportMessage.textContent = "Loading vendor preview...";
  reportMessage.style.color = "#0f4c81";
  try {
    const response = await fetch(
      `${apiBase}/api/reports/vendor-pickups/preview?vendor_id=${encodeURIComponent(
        vendorId,
      )}&from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(toDate)}`,
      { headers: window.getAuthHeaders() },
    );
    if (!response.ok) {
      throw new Error("Preview failed");
    }
    const rows = await response.json();
    renderPreviewTable(vendorPreviewTable, rows);
    reportMessage.textContent = "Vendor preview loaded.";
  } catch (error) {
    reportMessage.textContent = "Unable to load vendor preview.";
    reportMessage.style.color = "#b42318";
  }
};

const downloadCustomerReport = async (event) => {
  event.preventDefault();
  const customerId = customerSelect?.value;
  const fromDate = customerFromInput?.value;
  const toDate = customerToInput?.value;
  if (!customerId || !fromDate || !toDate) {
    reportMessage.textContent = "Select customer and date range.";
    reportMessage.style.color = "#b42318";
    return;
  }

  reportMessage.textContent = "Preparing customer report...";
  reportMessage.style.color = "#0f4c81";
  try {
    const response = await fetch(
      `${apiBase}/api/reports/customer-pickups?customer_id=${encodeURIComponent(
        customerId,
      )}&from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(toDate)}`,
      { headers: window.getAuthHeaders() },
    );
    if (!response.ok) {
      throw new Error("Report failed");
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `customer-pickups_${customerId}_${fromDate}_${toDate}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
    reportMessage.textContent = "Customer report downloaded.";
  } catch (error) {
    reportMessage.textContent = "Unable to download customer report.";
    reportMessage.style.color = "#b42318";
  }
};

const previewCustomerReport = async () => {
  const customerId = customerSelect?.value;
  const fromDate = customerFromInput?.value;
  const toDate = customerToInput?.value;
  if (!customerId || !fromDate || !toDate) {
    reportMessage.textContent = "Select customer and date range.";
    reportMessage.style.color = "#b42318";
    return;
  }
  reportMessage.textContent = "Loading customer preview...";
  reportMessage.style.color = "#0f4c81";
  try {
    const response = await fetch(
      `${apiBase}/api/reports/customer-pickups/preview?customer_id=${encodeURIComponent(
        customerId,
      )}&from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(toDate)}`,
      { headers: window.getAuthHeaders() },
    );
    if (!response.ok) {
      throw new Error("Preview failed");
    }
    const rows = await response.json();
    renderPreviewTable(customerPreviewTable, rows);
    reportMessage.textContent = "Customer preview loaded.";
  } catch (error) {
    reportMessage.textContent = "Unable to load customer preview.";
    reportMessage.style.color = "#b42318";
  }
};

const previewReconReport = async () => {
  const fromDate = reconFromInput?.value;
  const toDate = reconToInput?.value;
  if (!fromDate || !toDate) {
    reportMessage.textContent = "Select date range.";
    reportMessage.style.color = "#b42318";
    return;
  }
  reportMessage.textContent = "Loading reconciliation preview...";
  reportMessage.style.color = "#0f4c81";
  try {
    const response = await fetch(
      `${apiBase}/api/reports/reconciliation-final/preview?from_date=${encodeURIComponent(
        fromDate,
      )}&to_date=${encodeURIComponent(toDate)}`,
      { headers: window.getAuthHeaders() },
    );
    if (!response.ok) {
      throw new Error("Preview failed");
    }
    const rows = await response.json();
    renderPreviewTable(reconPreviewTable, rows);
    reportMessage.textContent = "Reconciliation preview loaded.";
  } catch (error) {
    reportMessage.textContent = "Unable to load reconciliation preview.";
    reportMessage.style.color = "#b42318";
  }
};

const downloadReconReport = async (event) => {
  event.preventDefault();
  const fromDate = reconFromInput?.value;
  const toDate = reconToInput?.value;
  if (!fromDate || !toDate) {
    reportMessage.textContent = "Select date range.";
    reportMessage.style.color = "#b42318";
    return;
  }

  reportMessage.textContent = "Preparing reconciliation report...";
  reportMessage.style.color = "#0f4c81";
  try {
    const response = await fetch(
      `${apiBase}/api/reports/reconciliation-final?from_date=${encodeURIComponent(
        fromDate,
      )}&to_date=${encodeURIComponent(toDate)}`,
      { headers: window.getAuthHeaders() },
    );
    if (!response.ok) {
      throw new Error("Report failed");
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reconciliation_final_${fromDate}_${toDate}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
    reportMessage.textContent = "Reconciliation report downloaded.";
  } catch (error) {
    reportMessage.textContent = "Unable to download reconciliation report.";
    reportMessage.style.color = "#b42318";
  }
};

document.querySelectorAll(".report-toggle").forEach((button) => {
  button.addEventListener("click", () => {
    const targetId = button.dataset.target;
    const section = document.getElementById(targetId);
    if (!section) return;
    document.querySelectorAll(".report-group").forEach((group) => {
      group.classList.add("hidden");
    });
    section.classList.remove("hidden");
  });
});

if (vendorReportForm) {
  vendorReportForm.addEventListener("submit", downloadVendorReport);
  loadVendors();
}

if (customerReportForm) {
  customerReportForm.addEventListener("submit", downloadCustomerReport);
  loadCustomers();
}

if (reconReportForm) {
  reconReportForm.addEventListener("submit", downloadReconReport);
}

if (vendorPreviewButton) {
  vendorPreviewButton.addEventListener("click", previewVendorReport);
}

if (customerPreviewButton) {
  customerPreviewButton.addEventListener("click", previewCustomerReport);
}

if (reconPreviewButton) {
  reconPreviewButton.addEventListener("click", previewReconReport);
}
