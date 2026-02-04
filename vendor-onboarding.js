const vendorForm = document.querySelector("#vendor-form");
const vendorMessage = document.querySelector("#vendor-message");
const vendorRows = document.querySelector("#vendor-rows");
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
      row.innerHTML = `
        <td>${vendor.name}</td>
        <td>${vendor.code}</td>
        <td>${displayStatus}</td>
      `;
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

const init = () => {
  if (!vendorForm) return;
  vendorForm.addEventListener("submit", submitVendor);
  loadVendors();
  loadClarifications();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
