const finacleForm = document.querySelector("#finacle-upload-form");
const finacleMessage = document.querySelector("#finacle-message");
const previewHead = document.querySelector("#finacle-preview-head");
const previewBody = document.querySelector("#finacle-preview-body");
const previewMessage = document.querySelector("#finacle-preview-message");
const fileInput = finacleForm?.querySelector('input[type="file"]');
const historyRows = document.querySelector("#finacle-history-rows");
const historyMessage = document.querySelector("#finacle-history-message");
const progressContainer = document.querySelector("#finacle-upload-progress");
const progressLabel = document.querySelector("#finacle-progress-label");
const progressFill = document.querySelector("#finacle-progress-fill");
const progressPercent = document.querySelector("#finacle-progress-percent");
const apiBase = window.API_BASE || "";

const showProgress = (label) => {
  if (progressContainer && progressLabel) {
    progressLabel.textContent = label || "Uploading...";
    progressContainer.hidden = false;
  }
  if (progressFill) progressFill.style.width = "0%";
  if (progressPercent) progressPercent.textContent = "0%";
};

const updateProgress = (pct) => {
  const val = Math.min(100, Math.round(pct));
  if (progressFill) progressFill.style.width = `${val}%`;
  if (progressPercent) progressPercent.textContent = `${val}%`;
};

const hideProgress = () => {
  if (progressContainer) progressContainer.hidden = true;
  if (progressFill) progressFill.style.width = "0%";
  if (progressPercent) progressPercent.textContent = "0%";
};

const fetchWithProgress = (url, options) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = options.body;
    const headers = options.headers || {};

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const pct = (e.loaded / e.total) * 100;
        updateProgress(pct);
      }
    });

    xhr.addEventListener("load", () => {
      hideProgress();
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: () => Promise.resolve(JSON.parse(xhr.responseText || "{}")),
        text: () => Promise.resolve(xhr.responseText || ""),
      });
    });

    xhr.addEventListener("error", () => {
      hideProgress();
      reject(new Error("Network error"));
    });

    xhr.addEventListener("abort", () => {
      hideProgress();
      reject(new Error("Request aborted"));
    });

    xhr.open(options.method || "POST", url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.send(formData);
  });
};

const clearPreview = () => {
  if (previewHead) previewHead.innerHTML = "";
  if (previewBody) previewBody.innerHTML = "";
};

/** Convert Excel serial date (e.g. 45672) to YYYY-MM-DD using IST (India) */
const formatExcelDate = (val, header) => {
  if (header !== "TRAN_DATE") return val;
  const n = Number(val);
  if (!Number.isFinite(n) || n < 1000 || n > 1000000) return val;
  const utcMs = Date.UTC(1899, 11, 30) + n * 24 * 60 * 60 * 1000;
  const d = new Date(utcMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
    headerRow.forEach((header, index) => {
      const td = document.createElement("td");
      td.textContent = formatExcelDate(row[index], String(header).trim()) ?? "";
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
    headers.forEach((header, index) => {
      const td = document.createElement("td");
      td.textContent = formatExcelDate(row[index], String(header).trim()) ?? "";
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

const finacleValidateBtn = document.querySelector("#finacle-validate-btn");
if (finacleValidateBtn) {
  finacleValidateBtn.addEventListener("click", async () => {
    const formData = new FormData(finacleForm);
    const misDate = formData.get("misDate");
    const file = finacleForm.querySelector('input[type="file"]').files[0];
    if (!misDate || !file) {
      finacleMessage.textContent = "Please select date and file first.";
      finacleMessage.style.color = "#b42318";
      return;
    }
    finacleMessage.textContent = "Validating stores...";
    finacleMessage.style.color = "#0f4c81";
    try {
      const payload = new FormData();
      payload.append("misDate", misDate);
      payload.append("file", file);
      const response = await fetch(`${apiBase}/api/uploads/finacle/validate`, {
        method: "POST",
        body: payload,
        headers: window.getAuthHeaders(),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        finacleMessage.textContent = err?.detail || "Validation failed.";
        finacleMessage.style.color = "#b42318";
        return;
      }
      const result = await response.json();
      if (result.missing_store_codes?.length) {
        finacleMessage.textContent =
          `Found ${result.missing_store_codes.length} missing store(s): ${result.missing_store_codes.join(", ")}. ` +
          "Add these in Store Onboarding before uploading.";
        finacleMessage.style.color = "#b42318";
      } else {
        finacleMessage.textContent = `All ${result.total_rows} store codes are onboarded. Ready to upload.`;
        finacleMessage.style.color = "#0f4c81";
      }
    } catch (e) {
      finacleMessage.textContent = "Validation failed. Please retry.";
      finacleMessage.style.color = "#b42318";
    }
  });
}

finacleForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(finacleForm);
  const misDate = formData.get("misDate");
  const file = finacleForm.querySelector('input[type="file"]').files[0];

  if (!misDate || !file) {
    finacleMessage.textContent = "Please select date and file.";
    finacleMessage.style.color = "#b42318";
    return;
  }

  finacleMessage.textContent = "Uploading Finacle MIS...";
  finacleMessage.style.color = "#0f4c81";
  showProgress("Uploading Finacle MIS...");

  try {
    const payload = new FormData();
    payload.append("misDate", misDate);
    payload.append("file", file);

    const response = await fetchWithProgress(`${apiBase}/api/uploads/finacle`, {
      method: "POST",
      body: payload,
      headers: window.getAuthHeaders(),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        finacleMessage.textContent = "Session expired or user inactive. Please login again.";
        finacleMessage.style.color = "#b42318";
        return;
      }
      let detail = "";
      try {
        const payload = await response.json();
        detail = payload?.detail || "";
      } catch (error) {
        detail = "";
      }
      finacleMessage.textContent = detail || "Upload failed. Please retry.";
      finacleMessage.style.color = "#b42318";
      return;
    }

    const result = await response.json();
    if (result.status === "FAILED" && result.invalid_rows > 0) {
      const ok = result.total_rows - result.invalid_rows;
      let msg =
        ok > 0
          ? `Partially uploaded: ${ok} row(s) succeeded, ${result.invalid_rows} row(s) invalid. `
          : `Upload failed: ${result.invalid_rows} row(s) invalid. `;
      msg += "Stores must be onboarded in Store Onboarding first.";
      if (result.missing_store_codes?.length) {
        msg += ` Missing store codes: ${result.missing_store_codes.join(", ")}.`;
      }
      msg += " Add these stores in Store Onboarding and retry.";
      finacleMessage.textContent = msg;
      finacleMessage.style.color = "#b42318";
    } else {
      finacleMessage.textContent = `Finacle MIS uploaded: ${file.name} (${misDate}).`;
      finacleMessage.style.color = "#0f4c81";
    }
    loadFinacleHistory();
  } catch (error) {
    hideProgress();
    finacleMessage.textContent = "Upload failed. Please retry.";
    finacleMessage.style.color = "#b42318";
  }
});

const getFinacleFilterParams = () => {
  const fromEl = document.querySelector("#finacle-filter-from");
  const toEl = document.querySelector("#finacle-filter-to");
  const params = new URLSearchParams();
  if (fromEl?.value) params.set("date_from", fromEl.value);
  if (toEl?.value) params.set("date_to", toEl.value);
  return params.toString();
};

const loadFinacleHistory = async () => {
  if (!historyRows) return;
  historyRows.innerHTML = "";
  if (historyMessage) {
    historyMessage.textContent = "Loading previous uploads...";
    historyMessage.style.color = "#0f4c81";
  }
  try {
    const query = getFinacleFilterParams();
    const url = `${apiBase}/api/uploads/finacle/batches${query ? `?${query}` : ""}`;
    const response = await fetch(url, {
      headers: window.getAuthHeaders(),
    });
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
          <td>${batch.mis_date ?? ""}</td>
          <td>${batch.file_name ?? ""}</td>
          <td>${batch.uploaded_by ?? ""}</td>
          <td>${batch.uploaded_at ?? ""}</td>
          <td>${batch.status ?? ""}</td>
          <td>
            <button class="secondary-btn action-icon-btn" type="button" data-preview-batch="${batch.batch_id}" title="Preview" aria-label="Preview">
              <span aria-hidden="true">👁</span>
            </button>
            <button class="secondary-btn action-icon-btn" type="button" data-download-batch="${batch.batch_id}" title="Download" aria-label="Download">
              <span aria-hidden="true">⬇</span>
            </button>
            <button class="secondary-btn action-icon-btn" type="button" data-delete-batch="${batch.batch_id}" title="Delete" aria-label="Delete">
              <span aria-hidden="true">✕</span>
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
        const response = await fetch(`${apiBase}/api/uploads/finacle/${batchId}/preview`, {
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
        const response = await fetch(`${apiBase}/api/uploads/finacle/${batchId}/download`, {
          headers: window.getAuthHeaders(),
        });
        if (!response.ok) {
          throw new Error("Download failed");
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `finacle_upload_${batchId}.xlsx`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(url);
      } catch (error) {
        finacleMessage.textContent = "Unable to download file.";
        finacleMessage.style.color = "#b42318";
      }
    }
    if (deleteButton) {
      const batchId = deleteButton.dataset.deleteBatch;
      const confirmed = window.confirm(
        `Delete batch ${batchId}? This will remove stored data for this upload.`,
      );
      if (!confirmed) return;
      try {
        const response = await fetch(`${apiBase}/api/uploads/finacle/${batchId}`, {
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
        finacleMessage.textContent = `Deleted batch ${batchId}.`;
        finacleMessage.style.color = "#0f4c81";
        loadFinacleHistory();
      } catch (error) {
        finacleMessage.textContent = error.message || "Unable to delete batch.";
        finacleMessage.style.color = "#b42318";
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

const filterApplyBtn = document.querySelector("#finacle-filter-apply");
const filterClearBtn = document.querySelector("#finacle-filter-clear");
if (filterApplyBtn) {
  filterApplyBtn.addEventListener("click", () => loadFinacleHistory());
}
if (filterClearBtn) {
  filterClearBtn.addEventListener("click", () => {
    const fromEl = document.querySelector("#finacle-filter-from");
    const toEl = document.querySelector("#finacle-filter-to");
    if (fromEl) fromEl.value = "";
    if (toEl) toEl.value = "";
    loadFinacleHistory();
  });
}

loadFinacleHistory();
