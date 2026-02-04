const approvalRows = document.querySelector("#approval-rows");
const approvalMessage = document.querySelector("#approval-message");
const apiBase = window.API_BASE || "";
let vendorLookup = {};

const currentUser = () =>
  sessionStorage.getItem("currentUser")
    ? JSON.parse(sessionStorage.getItem("currentUser"))
    : { employeeId: "SYSTEM" };

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

const parseProposedData = (raw) => {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    return {};
  }
};

const loadVendorsForApprovals = async () => {
  try {
    const response = await fetch(`${apiBase}/api/vendors?include_inactive=1`, {
      headers: window.getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error("Failed to load vendors");
    }
    const vendors = await response.json();
    vendorLookup = {};
    vendors.forEach((vendor) => {
      vendorLookup[String(vendor.vendor_id)] = vendor;
    });
  } catch (error) {
    vendorLookup = {};
  }
};

const resolveEndpoint = async (entityType, approvalId, action) => {
  const base = action === "APPROVE" ? "approve" : "reject";
  const directMap = {
    VENDOR_MASTER: `${apiBase}/api/vendors/requests/${approvalId}/${base}`,
    BANK_STORE_MASTER: `${apiBase}/api/bank-stores/requests/${approvalId}/${base}`,
    CHARGE_CONFIG: `${apiBase}/api/charge-configs/requests/${approvalId}/${base}`,
    VENDOR_CHARGE: `${apiBase}/api/vendor-charges/requests/${approvalId}/${base}`,
    WAIVER: `${apiBase}/api/waivers/requests/${approvalId}/${base}`,
    VENDOR_FILE_FORMAT: `${apiBase}/api/vendor-file-formats/requests/${approvalId}/${base}`,
    STORE_MAPPING: `${apiBase}/api/store-mappings/requests/${approvalId}/${base}`,
    PICKUP_RULE: `${apiBase}/api/pickup-rules/requests/${approvalId}/${base}`,
    REMITTANCE: `${apiBase}/api/remittances/requests/${approvalId}/${base}`,
    EXCEPTION_RESOLUTION: `${apiBase}/api/exceptions/requests/${approvalId}/${base}`,
  };

  if (entityType === "RECONCILIATION_CORRECTION") {
    return `${apiBase}/api/reconciliation/corrections/requests/${approvalId}/${base}`;
  }

  if (!directMap[entityType]) {
    throw new Error("Unsupported approval type");
  }

  return directMap[entityType];
};

const loadApprovals = async () => {
  approvalRows.innerHTML = "";
  approvalMessage.textContent = "Loading approvals...";
  approvalMessage.style.color = "#0f4c81";

  try {
    const response = await fetch(`${apiBase}/api/approvals/pending`, {
      headers: window.getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error("Failed to load approvals");
    }
    const approvals = await response.json();

    if (!approvals.length) {
      approvalMessage.textContent = "No pending approvals.";
      return;
    }

    approvals.forEach((item) => {
      const row = document.createElement("tr");
      const history = formatHistory(item.comments_history);
      const proposed = parseProposedData(item.proposed_data);
      const isVendor = item.entity_type === "VENDOR_MASTER";
      const isMapping = item.entity_type === "STORE_MAPPING";
      const proposedVendorId = proposed.vendor_id ? String(proposed.vendor_id) : "";
      const vendorFromLookup = proposedVendorId ? vendorLookup[proposedVendorId] : null;
      const vendorName = isVendor
        ? proposed.vendor_name || ""
        : vendorFromLookup?.name || "";
      const vendorCode = isVendor
        ? proposed.vendor_code || ""
        : vendorFromLookup?.code || "";
      const bankStoreCode = isMapping ? proposed.bank_store_code || "" : "";
      const customerId = isMapping ? proposed.customer_id || "" : "";
      const customerName = isMapping ? proposed.customer_name || "" : "";
      const accountNo = isMapping ? proposed.account_no || "" : "";
      const effectiveFrom = isVendor ? proposed.effective_from || "" : "";
      row.innerHTML = `
        <td>${item.approval_id}</td>
        <td>${item.entity_type}</td>
        <td>${item.maker_id}</td>
        <td>${vendorName}</td>
        <td>${vendorCode}</td>
        <td>${bankStoreCode}</td>
        <td>${customerId}</td>
        <td>${customerName}</td>
        <td>${accountNo}</td>
        <td>${effectiveFrom}</td>
        <td>${item.reason ?? ""}</td>
        <td><span class="status pending">${item.status}</span></td>
        <td>${item.created_date ?? ""}</td>
        <td>${history}</td>
        <td><input type="text" class="approval-comment" placeholder="Comment" /></td>
        <td class="button-row">
          <button class="secondary-btn" data-action="APPROVE">Approve</button>
          <button class="secondary-btn" data-action="REJECT">Reject</button>
          <button class="secondary-btn" data-action="CLARIFY">Clarify</button>
        </td>
      `;

      row.querySelectorAll("[data-action]").forEach((button) => {
        button.addEventListener("click", async () => {
          const comment = row.querySelector(".approval-comment").value.trim();
          if (!comment) {
            approvalMessage.textContent = "Comment required.";
            approvalMessage.style.color = "#b42318";
            return;
          }
          try {
            const action = button.dataset.action;
            const endpoint =
              action === "CLARIFY"
                ? `${apiBase}/api/approvals/${item.approval_id}/clarify`
                : await resolveEndpoint(item.entity_type, item.approval_id, action);
            const response = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
              body: JSON.stringify({
                checker_id: currentUser().employeeId,
                comment,
              }),
            });
            if (!response.ok) {
              throw new Error("Approval failed");
            }
            approvalMessage.textContent = "Action submitted.";
            approvalMessage.style.color = "#0f4c81";
            loadApprovals();
          } catch (error) {
            approvalMessage.textContent = "Unable to submit action.";
            approvalMessage.style.color = "#b42318";
          }
        });
      });
      approvalRows.appendChild(row);
    });

    approvalMessage.textContent = "";
  } catch (error) {
    approvalMessage.textContent = "Unable to load approvals.";
    approvalMessage.style.color = "#b42318";
  }
};

const init = async () => {
  await loadVendorsForApprovals();
  loadApprovals();
};

init();
