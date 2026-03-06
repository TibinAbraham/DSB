const storeForm = document.querySelector("#store-form");
const storeMessage = document.querySelector("#store-message");
const storeRows = document.querySelector("#store-rows");
const clarificationRows = document.querySelector("#clarification-rows");
const clarificationMessage = document.querySelector("#clarification-message");
const apiBase = window.API_BASE || "";

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

const loadStores = async () => {
  if (!storeRows) return;
  storeRows.innerHTML = "";

  try {
    const response = await fetch(`${apiBase}/api/bank-stores?include_inactive=1`, {
      headers: window.getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error("Failed to load stores");
    }
    const stores = await response.json();
    stores.forEach((store) => {
      const displayStatus =
        store.status === "INACTIVE" ? "INACTIVE (Pending Approval)" : store.status;
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${store.bank_store_code ?? ""}</td>
        <td>${store.store_name ?? ""}</td>
        <td>${store.customer_id ?? ""}</td>
        <td>${store.customer_name ?? ""}</td>
        <td>${store.account_no ?? ""}</td>
        <td>${displayStatus}</td>
      `;
      storeRows.appendChild(row);
    });
  } catch (error) {
    if (storeMessage) {
      storeMessage.textContent = "Unable to load stores.";
      storeMessage.style.color = "#b42318";
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
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
