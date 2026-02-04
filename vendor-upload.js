const vendorForm = document.querySelector("#vendor-upload-form");
const vendorMessage = document.querySelector("#vendor-message");
const vendorSelect = document.querySelector("#vendor-name");
const previewHead = document.querySelector("#vendor-preview-head");
const previewBody = document.querySelector("#vendor-preview-body");
const previewMessage = document.querySelector("#vendor-preview-message");
const fileInput = vendorForm?.querySelector('input[type="file"]');
const historyRows = document.querySelector("#vendor-history-rows");
const historyMessage = document.querySelector("#vendor-history-message");
const historyFilter = document.querySelector("#vendor-history-filter");
const validateButton = document.querySelector("#vendor-validate");
const validateMessage = document.querySelector("#vendor-validate-message");
let vendorLookup = {};
const apiBase = window.API_BASE || "";

const loadVendors = async () => {
  if (!vendorSelect) return;
  vendorSelect.innerHTML = '<option value="">Select vendor</option>';

  try {
    const response = await fetch(`${apiBase}/api/vendors`, {
      headers: window.getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error("Failed to load vendors");
    }
    const vendors = await response.json();
    const activeVendors = vendors.filter((vendor) => vendor.status === "ACTIVE");
    vendorLookup = {};
    activeVendors.forEach((vendor) => {
      if (!vendor.vendor_id || !vendor.name) return;
      vendorLookup[vendor.vendor_id] = vendor;
      const option = document.createElement("option");
      option.value = vendor.name;
      option.textContent = `${vendor.name} (${vendor.code || ""})`.trim();
      vendorSelect.appendChild(option);
    });
    if (historyFilter) {
      historyFilter.innerHTML = '<option value="">All vendors</option>';
      activeVendors.forEach((vendor) => {
        if (!vendor.vendor_id || !vendor.name) return;
        const option = document.createElement("option");
        option.value = vendor.vendor_id;
        option.textContent = `${vendor.name} (${vendor.code || ""})`.trim();
        historyFilter.appendChild(option);
      });
    }
  } catch (error) {
    vendorMessage.textContent = "Unable to load vendors. Please onboard first.";
    vendorMessage.style.color = "#b42318";
  }
};

const clearPreview = () => {
  if (previewHead) previewHead.innerHTML = "";
  if (previewBody) previewBody.innerHTML = "";
};

const renderPreview = (rows) => {
  if (!previewHead || !previewBody) return;
  clearPreview();

  if (!rows.length) {
    previewMessage.textContent = "No data found in file.";
    previewMessage.style.color = "#b42318";
    return;
  }

  const headerRow = rows[0] || [];
  const headTr = document.createElement("tr");
  headerRow.forEach((cell) => {
    const th = document.createElement("th");
    th.textContent = cell ?? "";
    headTr.appendChild(th);
  });
  previewHead.appendChild(headTr);

  rows.slice(1).forEach((row) => {
    const tr = document.createElement("tr");
    headerRow.forEach((_, index) => {
      const td = document.createElement("td");
      td.textContent = row[index] ?? "";
      tr.appendChild(td);
    });
    previewBody.appendChild(tr);
  });
};

const renderPreviewFromHeaders = (headers, rows) => {
  if (!previewHead || !previewBody) return;
  clearPreview();

  if (!headers.length) {
    previewMessage.textContent = "No data available for preview.";
    previewMessage.style.color = "#b42318";
    return;
  }

  const headTr = document.createElement("tr");
  headers.forEach((cell) => {
    const th = document.createElement("th");
    th.textContent = cell ?? "";
    headTr.appendChild(th);
  });
  previewHead.appendChild(headTr);

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    headers.forEach((_, index) => {
      const td = document.createElement("td");
      td.textContent = row[index] ?? "";
      tr.appendChild(td);
    });
    previewBody.appendChild(tr);
  });
};

const handleFilePreview = async (file) => {
  if (!previewMessage) return;
  if (!window.XLSX) {
    previewMessage.textContent = "Preview library not loaded.";
    previewMessage.style.color = "#b42318";
    return;
  }
  if (!file) {
    previewMessage.textContent = "Select a file to preview.";
    previewMessage.style.color = "#b42318";
    clearPreview();
    return;
  }

  previewMessage.textContent = "Loading preview...";
  previewMessage.style.color = "#0f4c81";

  try {
    const data = await file.arrayBuffer();
    const workbook = window.XLSX.read(data, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1 });
    renderPreview(rows);
    previewMessage.textContent = "";
  } catch (error) {
    previewMessage.textContent = "Unable to preview file.";
    previewMessage.style.color = "#b42318";
    clearPreview();
  }
};

vendorForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(vendorForm);
  const vendorName = formData.get("vendorName").trim();
  const misDate = formData.get("misDate");
  const file = vendorForm.querySelector('input[type="file"]').files[0];

  if (!vendorName || !misDate || !file) {
    vendorMessage.textContent = "Please enter vendor name, date, and file.";
    vendorMessage.style.color = "#b42318";
    return;
  }

  vendorMessage.textContent = "Uploading Vendor MIS...";
  vendorMessage.style.color = "#0f4c81";

  try {
    const payload = new FormData();
    payload.append("vendorName", vendorName);
    payload.append("misDate", misDate);
    payload.append("file", file);

    const response = await fetch(`${apiBase}/api/uploads/vendor`, {
      method: "POST",
      body: payload,
      headers: window.getAuthHeaders(),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        vendorMessage.textContent = "Session expired or user inactive. Please login again.";
        vendorMessage.style.color = "#b42318";
        return;
      }
      let detail = "";
      try {
        const payload = await response.json();
        detail = payload?.detail || "";
      } catch (error) {
        detail = "";
      }
      vendorMessage.textContent = detail || "Upload failed. Please retry.";
      vendorMessage.style.color = "#b42318";
      return;
    }

    try {
      const result = await response.json();
      const status = result?.status || "UNKNOWN";
      const invalid = result?.invalid_rows ?? 0;
      const total = result?.total_rows ?? "";
      if (status === "FAILED") {
        vendorMessage.textContent = `Upload failed. Invalid rows: ${invalid}${
          total !== "" ? ` of ${total}` : ""
        }. Check vendor store mapping and required fields.`;
        vendorMessage.style.color = "#b42318";
      } else {
        vendorMessage.textContent = `Vendor MIS uploaded (${status}). Invalid rows: ${invalid}${
          total !== "" ? ` of ${total}` : ""
        }.`;
        vendorMessage.style.color = "#0f4c81";
      }
    } catch (error) {
      vendorMessage.textContent =
        "Upload completed, but the server response was invalid. Please refresh history.";
      vendorMessage.style.color = "#0f4c81";
    }
    loadVendorHistory();
  } catch (error) {
    vendorMessage.textContent = "Upload failed. Please retry.";
    vendorMessage.style.color = "#b42318";
  }
});

const runValidation = async () => {
  const vendorName = vendorSelect.value?.trim();
  const misDate = vendorForm.querySelector('input[name="misDate"]').value;
  const file = vendorForm.querySelector('input[type="file"]').files[0];
  if (!vendorName || !misDate || !file) {
    validateMessage.textContent = "Please select vendor, date, and file to validate.";
    validateMessage.style.color = "#b42318";
    return;
  }
  validateMessage.textContent = "Validating file...";
  validateMessage.style.color = "#0f4c81";
  try {
    const payload = new FormData();
    payload.append("vendorName", vendorName);
    payload.append("misDate", misDate);
    payload.append("file", file);
    const response = await fetch(`${apiBase}/api/uploads/vendor/validate`, {
      method: "POST",
      body: payload,
      headers: window.getAuthHeaders(),
    });
    if (!response.ok) {
      let detail = "";
      try {
        const data = await response.json();
        detail = data?.detail || "";
      } catch (error) {
        detail = "";
      }
      validateMessage.textContent = detail || "Validation failed.";
      validateMessage.style.color = "#b42318";
      return;
    }
    const result = await response.json();
    if (result.unmapped_codes && result.unmapped_codes.length) {
      validateMessage.textContent = `Unmapped store codes: ${result.unmapped_codes.join(", ")}`;
      validateMessage.style.color = "#b42318";
      return;
    }
    if (result.out_of_range_codes && result.out_of_range_codes.length) {
      validateMessage.textContent = `Mapping date not effective for: ${result.out_of_range_codes.join(", ")}`;
      validateMessage.style.color = "#b42318";
      return;
    }
    validateMessage.textContent = `Validation passed. Invalid rows: ${result.invalid_rows ?? 0} of ${result.total_rows ?? ""}.`;
    validateMessage.style.color = "#0f4c81";
  } catch (error) {
    validateMessage.textContent = "Validation failed.";
    validateMessage.style.color = "#b42318";
  }
};

if (validateButton) {
  validateButton.addEventListener("click", (event) => {
    event.preventDefault();
    runValidation();
  });
}

const loadVendorHistory = async () => {
  if (!historyRows) return;
  historyRows.innerHTML = "";
  if (historyMessage) {
    historyMessage.textContent = "Loading previous uploads...";
    historyMessage.style.color = "#0f4c81";
  }
  const vendorId = historyFilter?.value || "";
  const url = vendorId
    ? `${apiBase}/api/uploads/vendor/batches?vendor_id=${encodeURIComponent(vendorId)}`
    : `${apiBase}/api/uploads/vendor/batches`;
  try {
    const response = await fetch(url, { headers: window.getAuthHeaders() });
    if (!response.ok) {
      throw new Error("Unable to load uploads");
    }
    const batches = await response.json();
    if (!batches.length) {
      if (historyMessage) {
        historyMessage.textContent = "No uploads found.";
        historyMessage.style.color = "#667085";
      }
      return;
    }
    historyRows.innerHTML = batches
      .map(
        (batch) => `
        <tr>
          <td>${batch.batch_id ?? ""}</td>
          <td>${batch.vendor_name ?? ""}</td>
          <td>${batch.mis_date ?? ""}</td>
          <td>${batch.file_name ?? ""}</td>
          <td>${batch.uploaded_by ?? ""}</td>
          <td>${batch.uploaded_at ?? ""}</td>
          <td>${batch.status ?? ""}</td>
          <td>
            <button class="secondary-btn" type="button" data-preview-batch="${batch.batch_id}">
              Preview
            </button>
            <button class="secondary-btn" type="button" data-download-batch="${batch.batch_id}">
              Download
            </button>
            <button class="secondary-btn" type="button" data-delete-batch="${batch.batch_id}">
              Delete
            </button>
          </td>
        </tr>
      `,
      )
      .join("");
    if (historyMessage) {
      historyMessage.textContent = "";
    }
  } catch (error) {
    if (historyMessage) {
      historyMessage.textContent = "Unable to load previous uploads.";
      historyMessage.style.color = "#b42318";
    }
  }
};

if (historyFilter) {
  historyFilter.addEventListener("change", () => {
    loadVendorHistory();
  });
}

if (historyRows) {
  historyRows.addEventListener("click", async (event) => {
    const previewButton = event.target.closest("button[data-preview-batch]");
    const downloadButton = event.target.closest("button[data-download-batch]");
    const deleteButton = event.target.closest("button[data-delete-batch]");
    if (previewButton) {
      const batchId = previewButton.dataset.previewBatch;
      previewMessage.textContent = "Loading preview...";
      previewMessage.style.color = "#0f4c81";
      try {
        const response = await fetch(`${apiBase}/api/uploads/vendor/${batchId}/preview`, {
          headers: window.getAuthHeaders(),
        });
        if (!response.ok) {
          throw new Error("Preview failed");
        }
        const payload = await response.json();
        renderPreviewFromHeaders(payload.headers || [], payload.rows || []);
        previewMessage.textContent = `Preview loaded for batch ${batchId}.`;
      } catch (error) {
        previewMessage.textContent = "Unable to preview this batch.";
        previewMessage.style.color = "#b42318";
      }
    }
    if (downloadButton) {
      const batchId = downloadButton.dataset.downloadBatch;
      try {
        const response = await fetch(`${apiBase}/api/uploads/vendor/${batchId}/download`, {
          headers: window.getAuthHeaders(),
        });
        if (!response.ok) {
          throw new Error("Download failed");
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `vendor_upload_${batchId}.xlsx`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(url);
      } catch (error) {
        vendorMessage.textContent = "Unable to download file.";
        vendorMessage.style.color = "#b42318";
      }
    }
    if (deleteButton) {
      const batchId = deleteButton.dataset.deleteBatch;
      const confirmed = window.confirm(
        `Delete batch ${batchId}? This will remove stored data for this upload.`,
      );
      if (!confirmed) return;
      try {
        const response = await fetch(`${apiBase}/api/uploads/vendor/${batchId}`, {
          method: "DELETE",
          headers: window.getAuthHeaders(),
        });
        if (!response.ok) {
          let detail = "";
          try {
            const data = await response.json();
            detail = data?.detail || "";
          } catch (error) {
            detail = "";
          }
          throw new Error(detail || "Delete failed");
        }
        vendorMessage.textContent = `Deleted batch ${batchId}.`;
        vendorMessage.style.color = "#0f4c81";
        loadVendorHistory();
      } catch (error) {
        vendorMessage.textContent = error.message || "Unable to delete batch.";
        vendorMessage.style.color = "#b42318";
      }
    }
  });
}

if (fileInput) {
  fileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    handleFilePreview(file);
  });
}

loadVendors();
loadVendorHistory();
