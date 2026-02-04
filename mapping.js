const form = document.querySelector("#mapping-form");
const rowsContainer = document.querySelector("#mapping-rows");
const listRowsContainer = document.querySelector("#mapping-list-rows");
const addRowButton = document.querySelector("#add-row");
const message = document.querySelector("#mapping-message");
const clarificationRows = document.querySelector("#clarification-rows");
const clarificationMessage = document.querySelector("#clarification-message");
const apiBase = window.API_BASE || "";
let vendorOptions = [];
let mappingsCache = [];
const currentUser = () =>
  sessionStorage.getItem("currentUser")
    ? JSON.parse(sessionStorage.getItem("currentUser"))
    : { employeeId: "SYSTEM" };

const loadVendors = async () => {
  try {
    const response = await fetch(`${apiBase}/api/vendors`, {
      headers: window.getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error("Failed to load vendors");
    }
    const vendors = await response.json();
    vendorOptions = vendors.map((vendor) => ({
      id: vendor.vendor_id,
      label: `${vendor.name} (${vendor.code})`,
    }));
  } catch (error) {
    vendorOptions = [];
  }
};

const createInput = (placeholder) => {
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;
  return input;
};

const createVendorSelect = (selectedId) => {
  const select = document.createElement("select");
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select vendor";
  select.appendChild(placeholder);
  vendorOptions.forEach((vendor) => {
    const option = document.createElement("option");
    option.value = vendor.id;
    option.textContent = vendor.label;
    if (String(selectedId) === String(vendor.id)) {
      option.selected = true;
    }
    select.appendChild(option);
  });
  return select;
};

const getVendorLabel = (vendorId) => {
  const match = vendorOptions.find((vendor) => String(vendor.id) === String(vendorId));
  return match ? match.label : vendorId ?? "";
};

const formatToInputDate = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value).slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
};

const buildRow = (row = {}) => {
  const tr = document.createElement("tr");

  const vendorCell = document.createElement("td");
  const vendorSelect = createVendorSelect(row.vendor_id);
  vendorCell.appendChild(vendorSelect);

  const vendorStoreCell = document.createElement("td");
  const vendorStoreInput = createInput("Vendor store code");
  vendorStoreInput.value = row.vendor_store_code || "";
  vendorStoreCell.appendChild(vendorStoreInput);

  const bankStoreCell = document.createElement("td");
  const bankStoreInput = createInput("Bank store code");
  bankStoreInput.value = row.bank_store_code || "";
  bankStoreCell.appendChild(bankStoreInput);

  const customerIdCell = document.createElement("td");
  const customerIdInput = createInput("Customer ID");
  customerIdInput.value = row.customer_id || "";
  customerIdCell.appendChild(customerIdInput);

  const customerNameCell = document.createElement("td");
  const customerNameInput = createInput("Customer name");
  customerNameInput.value = row.customer_name || "";
  customerNameCell.appendChild(customerNameInput);

  const accountNoCell = document.createElement("td");
  const accountNoInput = createInput("Account number");
  accountNoInput.value = row.account_no || "";
  accountNoCell.appendChild(accountNoInput);

  const effectiveFromCell = document.createElement("td");
  const effectiveFromInput = document.createElement("input");
  effectiveFromInput.type = "date";
  effectiveFromInput.value = formatToInputDate(row.effective_from);
  effectiveFromCell.appendChild(effectiveFromInput);

  tr.append(
    vendorCell,
    vendorStoreCell,
    bankStoreCell,
    customerIdCell,
    customerNameCell,
    accountNoCell,
    effectiveFromCell,
  );

  return tr;
};

const loadRows = async () => {
  rowsContainer.innerHTML = "";
  rowsContainer.appendChild(buildRow());
};

const loadMappingsList = async () => {
  if (!listRowsContainer) return;
  listRowsContainer.innerHTML = "";
  try {
    const response = await fetch(`${apiBase}/api/store-mappings?include_inactive=1`, {
      headers: window.getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error("Failed to load mappings");
    }
    const mappings = await response.json();
    mappingsCache = mappings || [];
    if (!mappingsCache.length) {
      return;
    }
    mappingsCache.forEach((row, index) => {
      const tr = document.createElement("tr");
      const statusValue = row.status || "";
      const approvalStatus = row.approval_status || "";
      const approvalAction = row.approval_action || "";
      let displayStatus = statusValue;
      if (approvalStatus === "REJECTED") {
        displayStatus = "REJECTED";
      } else if (approvalStatus === "PENDING" && approvalAction === "DEACTIVATE") {
        displayStatus = "SUBMITTED FOR DELETE APPROVAL";
      } else if (statusValue === "INACTIVE") {
        displayStatus = "INACTIVE (Pending Approval)";
      }
      const deleteDisabled = statusValue === "INACTIVE" ? "disabled" : "";
      tr.innerHTML = `
        <td>${getVendorLabel(row.vendor_id)}</td>
        <td>${row.vendor_store_code ?? ""}</td>
        <td>${row.bank_store_code ?? ""}</td>
        <td>${row.customer_id ?? ""}</td>
        <td>${row.customer_name ?? ""}</td>
        <td>${row.account_no ?? ""}</td>
        <td>${row.effective_from ?? ""}</td>
        <td>${displayStatus}</td>
        <td>
          <button class="secondary-btn" type="button" data-edit-index="${index}">Edit</button>
          <button class="secondary-btn" type="button" data-delete-index="${index}" ${deleteDisabled}>
            Delete
          </button>
        </td>
      `;
      listRowsContainer.appendChild(tr);
    });
  } catch (error) {
    message.textContent = "Unable to load mappings list.";
    message.style.color = "#b42318";
  }
};

const collectRows = () => {
  const rows = [];
  rowsContainer.querySelectorAll("tr").forEach((tr) => {
    const vendorSelect = tr.querySelector("select");
    const inputs = tr.querySelectorAll("input");
    const row = {
      vendor_id: vendorSelect.value ? Number(vendorSelect.value) : null,
      vendor_store_code: inputs[0].value.trim(),
      bank_store_code: inputs[1].value.trim(),
      customer_id: inputs[2].value.trim(),
      customer_name: inputs[3].value.trim(),
      account_no: inputs[4].value.trim(),
      effective_from: inputs[5].value ? inputs[5].value : null,
    };

    const hasData = Object.values(row).some((value) => value);
    if (hasData) {
      rows.push(row);
    }
  });
  return rows;
};

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
    const filtered = items.filter((item) => item.entity_type === "STORE_MAPPING");
    if (!filtered.length) {
      clarificationMessage.textContent = "No clarification requests.";
      return;
    }

    filtered.forEach((item) => {
      const row = document.createElement("tr");
      const history = formatHistory(item.comments_history);
      row.innerHTML = `
        <td>${item.approval_id}</td>
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

window.addMappingRow = () => {
  if (!rowsContainer) return;
  rowsContainer.appendChild(buildRow());
};

const bindEditMapping = () => {
  if (!listRowsContainer || !rowsContainer) return;
  listRowsContainer.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-edit-index]");
    const deleteButton = event.target.closest("button[data-delete-index]");
    if (!button) return;
    const index = Number(button.dataset.editIndex);
    const row = mappingsCache[index];
    if (!row) return;
    rowsContainer.innerHTML = "";
    rowsContainer.appendChild(buildRow(row));
    rowsContainer.scrollIntoView({ behavior: "smooth" });
  });
};

const bindDeleteMapping = () => {
  if (!listRowsContainer) return;
  listRowsContainer.addEventListener("click", async (event) => {
    const deleteButton = event.target.closest("button[data-delete-index]");
    if (!deleteButton) return;
    const index = Number(deleteButton.dataset.deleteIndex);
    const row = mappingsCache[index];
    if (!row) return;
    const reason = window.prompt("Enter maker comment for delete request:");
    if (!reason || !reason.trim()) {
      message.textContent = "Maker comment is required for delete request.";
      message.style.color = "#b42318";
      return;
    }
    message.textContent = "Submitting delete request...";
    message.style.color = "#0f4c81";
    try {
      const response = await fetch(
        `${apiBase}/api/store-mappings/requests/${row.mapping_id}/deactivate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
          body: JSON.stringify({
            maker_id: currentUser().employeeId,
            reason: reason.trim(),
          }),
        },
      );
      if (!response.ok) {
        let detail = "";
        try {
          const data = await response.json();
          detail = data?.detail || "";
        } catch (error) {
          detail = "";
        }
        throw new Error(detail || "Delete request failed");
      }
      message.textContent = "Delete request submitted for approval.";
      message.style.color = "#0f4c81";
      loadMappingsList();
    } catch (error) {
      message.textContent = error.message || "Unable to submit delete request.";
      message.style.color = "#b42318";
    }
  });
};

const bindAddRow = () => {
  if (!addRowButton) return;
  addRowButton.addEventListener("click", (event) => {
    event.preventDefault();
    window.addMappingRow();
  });
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const rows = collectRows();
  const makerComment = form.querySelector("[name='makerComment']")?.value.trim();

  if (!makerComment) {
    message.textContent = "Maker comment is required.";
    message.style.color = "#b42318";
    return;
  }
  if (!rows.length) {
    message.textContent = "Add at least one mapping row before saving.";
    message.style.color = "#b42318";
    return;
  }

  message.textContent = "Saving store mapping...";
  message.style.color = "#0f4c81";

  try {
    const response = await fetch(`${apiBase}/api/store-mappings/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
      body: JSON.stringify({
        mappings: rows,
        reason: makerComment,
        maker_id: sessionStorage.getItem("currentUser")
          ? JSON.parse(sessionStorage.getItem("currentUser")).employeeId
          : "SYSTEM",
      }),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        message.textContent = "Session expired or user inactive. Please login again.";
      }
      throw new Error("Save failed");
    }

    message.textContent = "Store mapping saved. Ready for reconciliation.";
    loadMappingsList();
  } catch (error) {
    if (!message.textContent || message.textContent.includes("Saving")) {
      message.textContent = "Unable to save mappings.";
    }
    message.style.color = "#b42318";
  }
});

const init = async () => {
  if (!rowsContainer || !form) {
    return;
  }
  bindAddRow();
  bindEditMapping();
  bindDeleteMapping();
  await loadVendors();
  loadRows();
  loadClarifications();
  loadMappingsList();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
