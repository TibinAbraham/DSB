const runReconButton = document.querySelector("#run-recon");
const reconMessage = document.querySelector("#recon-message");
const tableWrapper = document.querySelector("#recon-table-wrapper");
const misDateInput = document.querySelector("#recon-mis-date");
const downloadButton = document.querySelector("#download-recon");
const saveButton = document.querySelector("#save-recon");
const progressContainer = document.querySelector("#recon-progress");
const progressLabel = document.querySelector("#recon-progress-label");
const progressFill = document.querySelector("#recon-progress-fill");
const progressPercent = document.querySelector("#recon-progress-percent");
const apiBase = window.API_BASE || "";

const showReconProgress = () => {
  if (progressContainer && progressLabel) {
    progressLabel.textContent = "Running reconciliation...";
    progressContainer.hidden = false;
  }
  if (progressFill) progressFill.style.width = "0%";
  if (progressPercent) progressPercent.textContent = "0%";
};

const updateReconProgress = (pct) => {
  const val = Math.min(100, Math.round(pct));
  if (progressFill) progressFill.style.width = `${val}%`;
  if (progressPercent) progressPercent.textContent = `${val}%`;
};

const hideReconProgress = () => {
  if (progressContainer) progressContainer.hidden = true;
  if (progressFill) progressFill.style.width = "0%";
  if (progressPercent) progressPercent.textContent = "0%";
};

const startSimulatedProgress = (onComplete) => {
  let pct = 0;
  const maxPct = 90;
  const interval = setInterval(() => {
    pct += Math.random() * 8 + 4;
    if (pct >= maxPct) {
      pct = maxPct;
      clearInterval(interval);
    }
    updateReconProgress(pct);
  }, 200);
  return () => {
    clearInterval(interval);
    updateReconProgress(100);
    setTimeout(() => {
      hideReconProgress();
      if (onComplete) onComplete();
    }, 300);
  };
};

let latestResults = [];

const currentUser = () =>
  sessionStorage.getItem("currentUser")
    ? JSON.parse(sessionStorage.getItem("currentUser"))
    : { employeeId: "SYSTEM" };

const sanitizeCsvValue = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const downloadCsv = (rows, misDate) => {
  if (!rows.length) return;
  const headers = [
    "Bank Store Code",
    "Store Name",
    "Vendor Name",
    "Vendor Pickup Date",
    "Vendor Amount",
    "Finacle Date",
    "Finacle Amount",
    "Status",
    "Reason",
    "Edit Status",
  ];
  const editStatusDisplay = (s) =>
    s === "PENDING" ? "Pending" : s === "APPROVED" ? "Approved" : s === "REJECTED" ? "Rejected" : "";
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.bank_store_code,
        row.store_name,
        row.vendor_names,
        row.pickup_date,
        row.pickup_amount,
        row.remittance_date,
        row.remittance_amount,
        row.status,
        row.reason,
        editStatusDisplay(row.correction_status) || "",
      ]
        .map(sanitizeCsvValue)
        .join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `reconciliation_${misDate || "report"}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const renderTable = (results) => {
  if (!results.length) {
    tableWrapper.innerHTML = "";
    latestResults = [];
    downloadButton.disabled = true;
    downloadButton.hidden = true;
    return;
  }

  latestResults = results;
  downloadButton.disabled = false;
  downloadButton.hidden = false;
  const allMatched = results.every((r) => r.status === "MATCHED");
  if (saveButton) {
    saveButton.disabled = !allMatched;
    saveButton.hidden = !allMatched;
  }
  const rows = results
    .map(
      (row) => {
        const showEdit =
          row.status === "AMOUNT_MISMATCH" &&
          row.correction_status !== "PENDING" &&
          row.correction_status !== "APPROVED";
        const editStatusDisplay =
          row.correction_status === "PENDING"
            ? "Pending"
            : row.correction_status === "APPROVED"
              ? "Approved"
              : row.correction_status === "REJECTED"
                ? "Rejected"
                : "";
        return `
      <tr>
        <td>${row.bank_store_code || ""}</td>
        <td>${row.store_name || ""}</td>
        <td>${row.vendor_names || ""}</td>
        <td>${row.pickup_date || ""}</td>
        <td>${row.pickup_amount ?? ""}</td>
        <td>${row.remittance_date || ""}</td>
        <td>${row.remittance_amount ?? ""}</td>
        <td><span class="status ${row.status === "MATCHED" ? "match" : "mismatch"}">${row.status}</span></td>
        <td>${row.reason || ""}</td>
        <td>${editStatusDisplay || ""}</td>
        <td>
          ${showEdit ? `<button class="secondary-btn" data-action="edit-amount" data-recon-id="${row.recon_id}">Edit</button>` : ""}
        </td>
      </tr>
    `;
      },
    )
    .join("");

  tableWrapper.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Bank Store Code</th>
          <th>Store Name</th>
          <th>Vendor Name</th>
          <th>Vendor Pickup Date</th>
          <th>Vendor Amount</th>
          <th>Finacle Date</th>
          <th>Finacle Amount</th>
          <th>Status</th>
          <th>Reason</th>
          <th>Edit Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;

  tableWrapper.querySelectorAll('[data-action="edit-amount"]').forEach((button) => {
    button.addEventListener("click", async () => {
      const reconId = Number(button.dataset.reconId);
      const row = latestResults.find((item) => item.recon_id === reconId);
      if (!row) return;

      const vendorAmountRaw = prompt("Enter Vendor Amount", row.pickup_amount ?? "");
      if (vendorAmountRaw === null) return;
      const finacleAmountRaw = prompt("Enter Finacle Amount", row.remittance_amount ?? "");
      if (finacleAmountRaw === null) return;
      const reason = prompt("Enter reason for amount edit");
      if (!reason) {
        reconMessage.textContent = "Reason is required.";
        reconMessage.style.color = "#b42318";
        return;
      }

      const vendorAmount = Number(vendorAmountRaw);
      const finacleAmount = Number(finacleAmountRaw);
      if (Number.isNaN(vendorAmount) || Number.isNaN(finacleAmount)) {
        reconMessage.textContent = "Amounts must be valid numbers.";
        reconMessage.style.color = "#b42318";
        return;
      }

      try {
        const response = await fetch(`${apiBase}/api/reconciliation/corrections/requests`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
          body: JSON.stringify({
            recon_id: reconId,
            requested_action: "AMOUNT_EDIT",
            details: JSON.stringify({
              vendor_amount: vendorAmount,
              finacle_amount: finacleAmount,
            }),
            maker_id: currentUser().employeeId,
            reason,
          }),
        });
        if (!response.ok) {
          let detail = "";
          try {
            const data = await response.json();
            detail = data?.detail || "";
          } catch (error) {
            detail = "";
          }
          throw new Error(detail || "Unable to submit correction.");
        }
        reconMessage.textContent = "Correction submitted for approval. Run Reconciliation again to see approval status.";
        reconMessage.style.color = "#0f4c81";
      } catch (error) {
        reconMessage.textContent = error.message || "Unable to submit correction.";
        reconMessage.style.color = "#b42318";
      }
    });
  });
};

runReconButton.addEventListener("click", async () => {
  const misDate = misDateInput?.value;
  if (!misDate) {
    reconMessage.textContent = "Please select MIS date.";
    reconMessage.style.color = "#b42318";
    return;
  }
  reconMessage.textContent = "Running reconciliation...";
  reconMessage.style.color = "#0f4c81";
  showReconProgress();

  let finishProgress;
  const progressPromise = new Promise((resolve) => {
    finishProgress = startSimulatedProgress(resolve);
  });

  try {
    const response = await fetch(`${apiBase}/api/reconciliation/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
      body: JSON.stringify({ misDate }),
    });
    finishProgress();
    await progressPromise;

    if (!response.ok) {
      let detail = "";
      try {
        const data = await response.json();
        detail = data?.detail || "";
      } catch (error) {
        detail = "";
      }
      throw new Error(detail || "Reconciliation failed");
    }
    const results = await response.json();
    renderTable(results);
    reconMessage.textContent = results.length
      ? "Reconciliation completed."
      : "Reconciliation completed. No results found.";
  } catch (error) {
    if (finishProgress) finishProgress();
    await progressPromise;
    reconMessage.textContent = error.message || "Unable to run reconciliation.";
    reconMessage.style.color = "#b42318";
  }
});

downloadButton.addEventListener("click", () => {
  const misDate = misDateInput?.value;
  downloadCsv(latestResults, misDate);
});

saveButton?.addEventListener("click", async () => {
  const misDate = misDateInput?.value;
  if (!misDate) {
    reconMessage.textContent = "Please select MIS date.";
    reconMessage.style.color = "#b42318";
    return;
  }
  const reconIds = latestResults.map((r) => r.recon_id).filter((id) => id != null);
  if (!reconIds.length) {
    reconMessage.textContent = "No reconciliation results to save.";
    reconMessage.style.color = "#b42318";
    return;
  }
  reconMessage.textContent = "Saving reconciliation as final...";
  reconMessage.style.color = "#0f4c81";
  try {
    const response = await fetch(`${apiBase}/api/reconciliation/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
      body: JSON.stringify({ misDate, recon_ids: reconIds }),
    });
    if (!response.ok) {
      let detail = "";
      try {
        const data = await response.json();
        detail = data?.detail || "";
      } catch (error) {
        detail = "";
      }
      throw new Error(detail || "Save failed");
    }
    reconMessage.innerHTML = `Reconciliation saved as final. <a href="reconciliation-results.html?misDate=${encodeURIComponent(misDate)}" class="secondary-link">View in Daily Reconciliation Results</a>`;
    reconMessage.style.color = "#0f4c81";
  } catch (error) {
    reconMessage.textContent = error.message || "Unable to save reconciliation.";
    reconMessage.style.color = "#b42318";
  }
});
