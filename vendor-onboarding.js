const vendorForm = document.querySelector("#vendor-form");
const vendorMessage = document.querySelector("#vendor-message");
const vendorRows = document.querySelector("#vendor-rows");
const clarificationRows = document.querySelector("#clarification-rows");
const clarificationMessage = document.querySelector("#clarification-message");
const apiBase = window.API_BASE || "";

const currentUser = () =>
  sessionStorage.getItem("currentUser")
    ? JSON.parse(sessionStorage.getItem("currentUser"))
    : { employeeId: "SYSTEM" };

/* Vendor File Format Config (modal) */
const fileConfigBtn = document.querySelector("#file-config-btn");
const fileConfigModal = document.querySelector("#file-config-modal");
const voFormatVendorSelect = document.querySelector("#vo-vendor-format-vendor");
const voFormatForm = document.querySelector("#vo-vendor-format-form");
const voFormatMessage = document.querySelector("#vo-vendor-format-message");
const voMappingRows = document.querySelector("#vo-vendor-format-mapping-rows");
const voMappingTextarea = document.querySelector("#vo-header-mapping");
const voGenerateBtn = document.querySelector("#vo-generate-vendor-mapping");
const voSampleInput = document.querySelector("#vo-vendor-format-sample");
let voHeaderOptions = [];

const voMappingFields = [
  { key: "pickup_date_column", label: "Pickup Date (required)" },
  { key: "pickup_amount_column", label: "Pickup Amount (required)" },
  { key: "vendor_store_code_column", label: "Vendor Store Code (required)" },
  { key: "pickup_type_column", label: "Pickup Type (optional)" },
  { key: "account_no_column", label: "Account Number (optional)" },
  { key: "customer_id_column", label: "Customer ID (optional)" },
  { key: "customer_name_column", label: "Customer Name (optional)" },
  { key: "remittance_amount_column", label: "Remittance Amount (optional)" },
  { key: "remittance_date_column", label: "Remittance Date (optional)" },
];

const formatHistory = (raw) => {
  if (!raw) return "";
  try {
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return "";
    return items
      .map(
        (entry) =>
          `${entry.role || ""} ${entry.user_id || ""}: ${entry.comment || ""}`,
      )
      .join("<br/>");
  } catch (error) {
    return "";
  }
};

const loadVendorsForFormat = async () => {
  if (!voFormatVendorSelect) return;
  voFormatVendorSelect.innerHTML = '<option value="">Select vendor</option>';
  try {
    const response = await fetch(`${apiBase}/api/vendors?include_inactive=1`, {
      headers: window.getAuthHeaders(),
    });
    if (!response.ok) return;
    const vendors = await response.json();
    vendors.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.vendor_id;
      opt.textContent = `${v.name || v.vendor_name || ""} (${v.code || v.vendor_code || ""})`.trim() || v.vendor_id;
      voFormatVendorSelect.appendChild(opt);
    });
  } catch (_) {}
};

const voUpdateMappingSelectOptions = () => {
  if (!voMappingRows) return;
  const allOptions = [...new Set(voHeaderOptions)];
  voMappingRows.querySelectorAll("select[data-mapping-key]").forEach((select) => {
    const current = select.value;
    select.innerHTML = '<option value="">Select column</option>';
    allOptions.forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      select.appendChild(o);
    });
    select.value = current;
  });
};

const voRenderMappingBuilder = () => {
  if (!voMappingRows) return;
  voMappingRows.innerHTML = voMappingFields
    .map(
      (f) => `
      <tr>
        <td>${f.label}</td>
        <td><select data-mapping-key="${f.key}"><option value="">Select column</option></select></td>
      </tr>
    `
    )
    .join("");
  voUpdateMappingSelectOptions();
};

const voGenerateMappingJson = () => {
  if (!voMappingTextarea || !voMappingRows) return;
  const payload = {};
  voMappingRows.querySelectorAll("select[data-mapping-key]").forEach((select) => {
    const key = select.dataset.mappingKey;
    const value = select.value.trim();
    if (value) payload[key] = value;
  });
  voMappingTextarea.value = JSON.stringify(payload, null, 2);
};

const showFileConfigModal = () => {
  if (!fileConfigModal) return;
  loadVendorsForFormat();
  voRenderMappingBuilder();
  fileConfigModal.hidden = false;
  fileConfigModal.classList.add("approval-modal-visible");
};

const hideFileConfigModal = () => {
  if (!fileConfigModal) return;
  fileConfigModal.hidden = true;
  fileConfigModal.classList.remove("approval-modal-visible");
};

const deactivateVendorModal = document.querySelector("#deactivate-vendor-modal");
const deactivateVendorForm = document.querySelector("#deactivate-vendor-form");
const deactivateVendorIdInput = document.querySelector("#deactivate-vendor-id");
const deactivateVendorNameInput = document.querySelector("#deactivate-vendor-name");
const deactivateMakerCommentInput = document.querySelector("#deactivate-maker-comment");
const deactivateVendorMessage = document.querySelector("#deactivate-vendor-message");

const showDeactivateVendorModal = (vendorId, vendorName) => {
  if (!deactivateVendorModal) return;
  if (deactivateVendorIdInput) deactivateVendorIdInput.value = vendorId;
  if (deactivateVendorNameInput) deactivateVendorNameInput.value = vendorName || "";
  if (deactivateMakerCommentInput) deactivateMakerCommentInput.value = "";
  if (deactivateVendorMessage) deactivateVendorMessage.textContent = "";
  deactivateVendorModal.hidden = false;
  deactivateVendorModal.classList.add("approval-modal-visible");
};

const hideDeactivateVendorModal = () => {
  if (!deactivateVendorModal) return;
  deactivateVendorModal.hidden = true;
  deactivateVendorModal.classList.remove("approval-modal-visible");
};

const requestDeactivateVendor = async (vendorId, makerComment) => {
  try {
    const response = await fetch(`${apiBase}/api/vendors/requests/${vendorId}/deactivate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
      body: JSON.stringify({
        vendor_id: Number(vendorId),
        maker_id: currentUser().employeeId,
        reason: makerComment || undefined,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.detail || "Failed to submit request");
    }
    if (vendorMessage) {
      vendorMessage.textContent = "Deactivation request submitted for checker approval.";
      vendorMessage.style.color = "#0f4c81";
    }
    hideDeactivateVendorModal();
    loadVendors();
    loadVendorsForFormat();
  } catch (error) {
    if (deactivateVendorMessage) {
      deactivateVendorMessage.textContent = error.message || "Unable to submit request.";
      deactivateVendorMessage.style.color = "#b42318";
    }
  }
};

const loadVendors = async () => {
  if (!vendorRows) return;
  vendorRows.innerHTML = "";

  try {
    const response = await fetch(`${apiBase}/api/vendors?include_inactive=1`, {
      headers: window.getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error("Failed to load vendors");
    }
    const vendors = await response.json();
    vendors.forEach((vendor) => {
      const displayStatus =
        vendor.status === "INACTIVE" ? "INACTIVE (Pending Approval)" : vendor.status;
      const row = document.createElement("tr");
      const inactiveBtn =
        vendor.status === "ACTIVE"
          ? `<button type="button" class="secondary-btn" data-deactivate-vendor="${vendor.vendor_id}">Make Inactive</button>`
          : "";
      row.innerHTML = `
        <td>${vendor.name}</td>
        <td>${vendor.code}</td>
        <td>${displayStatus}</td>
        <td>${inactiveBtn}</td>
      `;
      const btn = row.querySelector("[data-deactivate-vendor]");
      if (btn) {
        btn.addEventListener("click", () => showDeactivateVendorModal(vendor.vendor_id, vendor.name));
      }
      vendorRows.appendChild(row);
    });
  } catch (error) {
    if (vendorMessage) {
      vendorMessage.textContent = "Unable to load vendors.";
      vendorMessage.style.color = "#b42318";
    }
  }
};

const loadClarifications = async () => {
  if (!clarificationRows) return;
  clarificationRows.innerHTML = "";
  clarificationMessage.textContent = "Loading clarifications...";
  clarificationMessage.style.color = "#0f4c81";

  try {
    const response = await fetch(`${apiBase}/api/approvals/clarifications`, {
      headers: window.getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error("Failed to load clarifications");
    }
    const items = await response.json();
    if (!items.length) {
      clarificationMessage.textContent = "No clarification requests.";
      return;
    }

    items.forEach((item) => {
      const row = document.createElement("tr");
      const history = formatHistory(item.comments_history);
      row.innerHTML = `
        <td>${item.approval_id}</td>
        <td>${item.entity_type}</td>
        <td>${item.status}</td>
        <td>${item.reason ?? ""}</td>
        <td>${item.checker_comment ?? ""}</td>
        <td>${history}</td>
        <td><input type="text" class="maker-reply" placeholder="Reply to checker" /></td>
        <td><button class="secondary-btn" data-resubmit="${item.approval_id}">Resubmit</button></td>
      `;
      row.querySelector("[data-resubmit]").addEventListener("click", async () => {
        const reply = row.querySelector(".maker-reply").value.trim();
        if (!reply) {
          clarificationMessage.textContent = "Reply comment required.";
          clarificationMessage.style.color = "#b42318";
          return;
        }
        try {
          const res = await fetch(`${apiBase}/api/approvals/${item.approval_id}/resubmit`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
            body: JSON.stringify({ comment: reply }),
          });
          if (!res.ok) {
            throw new Error("Resubmit failed");
          }
          clarificationMessage.textContent = "Resubmitted to checker.";
          clarificationMessage.style.color = "#0f4c81";
          loadClarifications();
        } catch (error) {
          clarificationMessage.textContent = "Unable to resubmit.";
          clarificationMessage.style.color = "#b42318";
        }
      });
      clarificationRows.appendChild(row);
    });

    clarificationMessage.textContent = "";
  } catch (error) {
    clarificationMessage.textContent = "Unable to load clarifications.";
    clarificationMessage.style.color = "#b42318";
  }
};

const submitVendor = async (event) => {
  event.preventDefault();
  if (!vendorForm) return;

  const formData = new FormData(vendorForm);
  const name = formData.get("vendorName").trim();
  const code = formData.get("vendorCode").trim();
  const effectiveFrom = formData.get("effectiveFrom");
  const makerComment = formData.get("makerComment").trim();

  if (!name || !code || !effectiveFrom || !makerComment) {
    vendorMessage.textContent = "Please enter vendor name, code, date, and comment.";
    vendorMessage.style.color = "#b42318";
    return;
  }

  vendorMessage.textContent = "Saving vendor...";
  vendorMessage.style.color = "#0f4c81";

  try {
    const response = await fetch(`${apiBase}/api/vendors`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
      body: JSON.stringify({
        vendor_name: name,
        vendor_code: code,
        status: "INACTIVE",
        effective_from: effectiveFrom,
        reason: makerComment,
        maker_id: sessionStorage.getItem("currentUser")
          ? JSON.parse(sessionStorage.getItem("currentUser")).employeeId
          : "SYSTEM",
      }),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        vendorMessage.textContent = "Session expired. Please login again.";
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
      vendorMessage.textContent = detail || "Unable to save vendor.";
      vendorMessage.style.color = "#b42318";
      return;
    }

    vendorMessage.textContent = "Vendor request submitted for approval.";
    vendorForm.reset();
    loadVendors();
  } catch (error) {
    if (!vendorMessage.textContent) {
      vendorMessage.textContent = "Unable to save vendor.";
    }
    vendorMessage.style.color = "#b42318";
  }
};

const submitVoFormatForm = async (event) => {
  event.preventDefault();
  if (!voFormatForm || !voFormatMessage) return;
  const formData = new FormData(voFormatForm);
  const vendorId = formData.get("vendorId");
  const formatName = formData.get("formatName");
  const headerMapping = formData.get("headerMapping");
  const effectiveFrom = formData.get("effectiveFrom");
  const makerComment = formData.get("makerComment") || "";

  if (!vendorId || !formatName || !headerMapping || !effectiveFrom) {
    voFormatMessage.textContent = "Please fill vendor, format name, header mapping, and effective from.";
    voFormatMessage.style.color = "#b42318";
    return;
  }

  voFormatMessage.textContent = "Submitting...";
  voFormatMessage.style.color = "#0f4c81";

  try {
    const response = await fetch(`${apiBase}/api/vendor-file-formats/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
      body: JSON.stringify({
        vendor_id: Number(vendorId),
        format_name: formatName,
        header_mapping_json: headerMapping,
        effective_from: effectiveFrom,
        status: "ACTIVE",
        maker_id: currentUser().employeeId,
        reason: makerComment || undefined,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.detail || "Request failed");
    }
    voFormatMessage.textContent = "Request submitted for approval.";
    voFormatMessage.style.color = "#0f4c81";
    voFormatForm.reset();
    hideFileConfigModal();
  } catch (error) {
    voFormatMessage.textContent = error.message || "Request failed.";
    voFormatMessage.style.color = "#b42318";
  }
};

const init = () => {
  if (!vendorForm) return;
  vendorForm.addEventListener("submit", submitVendor);
  loadVendors();
  loadClarifications();

  /* Vendor File Format Config modal */
  if (fileConfigBtn) {
    fileConfigBtn.addEventListener("click", showFileConfigModal);
  }
  if (fileConfigModal) {
    fileConfigModal.querySelector(".approval-modal-backdrop")?.addEventListener("click", hideFileConfigModal);
    fileConfigModal.querySelector(".approval-modal-close")?.addEventListener("click", hideFileConfigModal);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && fileConfigModal.classList.contains("approval-modal-visible")) {
        hideFileConfigModal();
      }
    });
  }
  if (deactivateVendorForm) {
    deactivateVendorForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const vendorId = deactivateVendorIdInput?.value;
      const comment = deactivateMakerCommentInput?.value?.trim();
      if (!vendorId || !comment) {
        if (deactivateVendorMessage) {
          deactivateVendorMessage.textContent = "Maker comment is required.";
          deactivateVendorMessage.style.color = "#b42318";
        }
        return;
      }
      deactivateVendorMessage.textContent = "Submitting...";
      deactivateVendorMessage.style.color = "#0f4c81";
      await requestDeactivateVendor(vendorId, comment);
    });
  }
  if (deactivateVendorModal) {
    deactivateVendorModal.querySelector(".approval-modal-backdrop")?.addEventListener("click", hideDeactivateVendorModal);
    deactivateVendorModal.querySelector(".approval-modal-close")?.addEventListener("click", hideDeactivateVendorModal);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && deactivateVendorModal.classList.contains("approval-modal-visible")) {
        hideDeactivateVendorModal();
      }
    });
  }
  if (voFormatForm) {
    voFormatForm.addEventListener("submit", submitVoFormatForm);
  }
  if (voGenerateBtn) {
    voGenerateBtn.addEventListener("click", voGenerateMappingJson);
  }
  if (voSampleInput) {
    voSampleInput.addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file || !window.XLSX) return;
      try {
        const data = await file.arrayBuffer();
        const workbook = window.XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheetData = workbook.Sheets[sheetName];
        const rows = window.XLSX.utils.sheet_to_json(sheetData, { header: 1 });
        const headerRow = rows[0] || [];
        voHeaderOptions = headerRow.map((c) => String(c || "").trim()).filter(Boolean);
        voUpdateMappingSelectOptions();
      } catch (_) {
        voHeaderOptions = [];
        voUpdateMappingSelectOptions();
      }
    });
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
