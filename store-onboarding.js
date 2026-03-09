const storeForm = document.querySelector("#store-form");
const storeMessage = document.querySelector("#store-message");
const storeRows = document.querySelector("#store-rows");
const storeStatusFilter = document.querySelector("#store-status-filter");
const storeDownloadBtn = document.querySelector("#store-download-btn");
const clarificationRows = document.querySelector("#clarification-rows");
const clarificationMessage = document.querySelector("#clarification-message");
const apiBase = window.API_BASE || "";
let storeCache = [];

const currentUser = () =>
  sessionStorage.getItem("currentUser")
    ? JSON.parse(sessionStorage.getItem("currentUser"))
    : { employeeId: "SYSTEM" };

const deactivateStoreModal = document.querySelector("#deactivate-store-modal");
const deactivateStoreForm = document.querySelector("#deactivate-store-form");
const deactivateStoreIdInput = document.querySelector("#deactivate-store-id");
const deactivateStoreNameInput = document.querySelector("#deactivate-store-name");
const deactivateStoreMakerCommentInput = document.querySelector("#deactivate-store-maker-comment");
const deactivateStoreMessage = document.querySelector("#deactivate-store-message");

const showDeactivateStoreModal = (storeId, storeLabel) => {
  if (!deactivateStoreModal) return;
  if (deactivateStoreIdInput) deactivateStoreIdInput.value = storeId;
  if (deactivateStoreNameInput) deactivateStoreNameInput.value = storeLabel || "";
  if (deactivateStoreMakerCommentInput) deactivateStoreMakerCommentInput.value = "";
  if (deactivateStoreMessage) deactivateStoreMessage.textContent = "";
  deactivateStoreModal.hidden = false;
  deactivateStoreModal.classList.add("approval-modal-visible");
};

const hideDeactivateStoreModal = () => {
  if (!deactivateStoreModal) return;
  deactivateStoreModal.hidden = true;
  deactivateStoreModal.classList.remove("approval-modal-visible");
};

const requestDeactivateStore = async (storeId, makerComment) => {
  try {
    const response = await fetch(`${apiBase}/api/bank-stores/requests/${storeId}/deactivate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
      body: JSON.stringify({
        store_id: Number(storeId),
        maker_id: currentUser().employeeId,
        reason: makerComment || undefined,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.detail || "Failed to submit request");
    }
    if (storeMessage) {
      storeMessage.textContent = "Deactivation request submitted for checker approval.";
      storeMessage.style.color = "#0f4c81";
    }
    hideDeactivateStoreModal();
    loadStores();
  } catch (error) {
    if (deactivateStoreMessage) {
      deactivateStoreMessage.textContent = error.message || "Unable to submit request.";
      deactivateStoreMessage.style.color = "#b42318";
    }
  }
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

const getFilteredStores = () => {
  const statusFilter = storeStatusFilter?.value || "";
  if (!statusFilter) return storeCache;
  return storeCache.filter((s) => s.status === statusFilter);
};

const renderStores = (stores) => {
  if (!storeRows) return;
  storeRows.innerHTML = "";
  stores.forEach((store) => {
    const displayStatus =
      store.status === "INACTIVE" ? "INACTIVE (Pending Approval)" : store.status;
    const row = document.createElement("tr");
    const effectiveFrom = store.effective_from
      ? new Date(store.effective_from).toISOString().slice(0, 10)
      : "";
    const storeLabel = [store.bank_store_code, store.store_name].filter(Boolean).join(" - ") || store.store_id;
    const inactiveBtn =
      store.status === "ACTIVE"
        ? `<button type="button" class="secondary-btn" data-deactivate-store="${store.store_id}">Make Inactive</button>`
        : "";
    row.innerHTML = `
      <td>${store.bank_store_code ?? ""}</td>
      <td>${store.store_name ?? ""}</td>
      <td>${store.customer_id ?? ""}</td>
      <td>${store.customer_name ?? ""}</td>
      <td>${store.account_no ?? ""}</td>
      <td>${effectiveFrom}</td>
      <td>${displayStatus}</td>
      <td>${inactiveBtn}</td>
    `;
    const btn = row.querySelector("[data-deactivate-store]");
    if (btn) {
      btn.addEventListener("click", () => showDeactivateStoreModal(store.store_id, storeLabel));
    }
    storeRows.appendChild(row);
  });
};

const loadStores = async () => {
  if (!storeRows) return;

  try {
    const response = await fetch(`${apiBase}/api/bank-stores?include_inactive=1`, {
      headers: window.getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error("Failed to load stores");
    }
    storeCache = await response.json();
    renderStores(getFilteredStores());
  } catch (error) {
    if (storeMessage) {
      storeMessage.textContent = "Unable to load stores.";
      storeMessage.style.color = "#b42318";
    }
  }
};

const escapeCsv = (val) => {
  if (val == null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const downloadStoresList = () => {
  const stores = getFilteredStores();
  const headers = ["Bank Store Code", "Store Name", "Customer ID", "Customer Name", "Account No", "Effective From", "Status"];
  const rows = stores.map((s) => {
    const eff = s.effective_from ? new Date(s.effective_from).toISOString().slice(0, 10) : "";
    return [s.bank_store_code, s.store_name, s.customer_id, s.customer_name, s.account_no, eff, s.status]
      .map(escapeCsv)
      .join(",");
  });
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `store_list_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
    const filtered = items.filter((item) => item.entity_type === "BANK_STORE_MASTER");
    if (!filtered.length) {
      clarificationMessage.textContent = "No clarification requests.";
      return;
    }

    filtered.forEach((item) => {
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

const submitStore = async (event) => {
  event.preventDefault();
  if (!storeForm) return;

  const formData = new FormData(storeForm);
  const bankStoreCode = formData.get("bankStoreCode").trim();
  const storeName = formData.get("storeName").trim();
  const customerId = formData.get("customerId").trim();
  const customerName = formData.get("customerName").trim();
  const accountNo = formData.get("accountNo").trim();
  const effectiveFrom = formData.get("effectiveFrom");
  const makerComment = formData.get("makerComment").trim();

  if (!bankStoreCode || !effectiveFrom || !makerComment) {
    storeMessage.textContent = "Please enter bank store code, date, and comment.";
    storeMessage.style.color = "#b42318";
    return;
  }

  storeMessage.textContent = "Saving store...";
  storeMessage.style.color = "#0f4c81";

  try {
    const response = await fetch(`${apiBase}/api/bank-stores/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
      body: JSON.stringify({
        bank_store_code: bankStoreCode,
        store_name: storeName || null,
        customer_id: customerId || null,
        customer_name: customerName || null,
        account_no: accountNo || null,
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
        storeMessage.textContent = "Session expired. Please login again.";
        storeMessage.style.color = "#b42318";
        return;
      }
      let detail = "";
      try {
        const payload = await response.json();
        detail = payload?.detail || "";
      } catch (error) {
        detail = "";
      }
      storeMessage.textContent = detail || "Unable to save store.";
      storeMessage.style.color = "#b42318";
      return;
    }

    storeMessage.textContent = "Store request submitted for approval.";
    storeForm.reset();
    loadStores();
  } catch (error) {
    if (!storeMessage.textContent) {
      storeMessage.textContent = "Unable to save store.";
    }
    storeMessage.style.color = "#b42318";
  }
};

const init = () => {
  if (!storeForm) return;
  storeForm.addEventListener("submit", submitStore);
  loadStores();
  loadClarifications();

  storeStatusFilter?.addEventListener("change", () => {
    renderStores(getFilteredStores());
  });
  storeDownloadBtn?.addEventListener("click", downloadStoresList);

  if (deactivateStoreForm) {
    deactivateStoreForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const storeId = deactivateStoreIdInput?.value;
      const comment = deactivateStoreMakerCommentInput?.value?.trim();
      if (!storeId || !comment) {
        if (deactivateStoreMessage) {
          deactivateStoreMessage.textContent = "Maker comment is required.";
          deactivateStoreMessage.style.color = "#b42318";
        }
        return;
      }
      if (deactivateStoreMessage) {
        deactivateStoreMessage.textContent = "Submitting...";
        deactivateStoreMessage.style.color = "#0f4c81";
      }
      await requestDeactivateStore(storeId, comment);
    });
  }
  if (deactivateStoreModal) {
    deactivateStoreModal.querySelector(".approval-modal-backdrop")?.addEventListener("click", hideDeactivateStoreModal);
    deactivateStoreModal.querySelector(".approval-modal-close")?.addEventListener("click", hideDeactivateStoreModal);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && deactivateStoreModal.classList.contains("approval-modal-visible")) {
        hideDeactivateStoreModal();
      }
    });
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
