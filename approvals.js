const approvalRows = document.querySelector("#approval-rows");
const approvalMessage = document.querySelector("#approval-message");
const approvalSearchInput = document.querySelector("#approval-search");
const apiBase = window.API_BASE || "";
let vendorLookup = {};
let approvalsCache = [];

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

const SKIP_FIELDS = ["maker_id", "status", "reason"];

const formatMakerEntered = (entityType, proposed, vendorLookup) => {
  if (!proposed || typeof proposed !== "object") return "<em>No data</em>";
  const p = proposed;

  const label = (key) =>
    key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const row = (k, v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s === "") return "";
    return `<div class="maker-row"><span class="maker-label">${label(k)}:</span> <span class="maker-value">${escapeHtml(s)}</span></div>`;
  };

  const formatHeaderMapping = (jsonStr) => {
    if (!jsonStr) return "";
    try {
      const obj = typeof jsonStr === "string" ? JSON.parse(jsonStr) : jsonStr;
      if (typeof obj !== "object") return escapeHtml(String(jsonStr));
      return Object.entries(obj)
        .map(([k, v]) => row(k, v))
        .join("");
    } catch {
      return row("Header Mapping", jsonStr);
    }
  };

  const vendorName = (id) => {
    if (!id) return "";
    const v = vendorLookup[String(id)];
    return v ? `${v.name || v.code || id}` : id;
  };

  const entityConfig = {
    VENDOR_MASTER: () => {
      if (p.action === "DEACTIVATE")
        return [row("Action", "Deactivate Vendor"), row("Vendor ID", p.vendor_id)].join("");
      return [row("Vendor Name", p.vendor_name), row("Vendor Code", p.vendor_code), row("Effective From", p.effective_from)].join("");
    },
    BANK_STORE_MASTER: () => {
      if (p.action === "DEACTIVATE")
        return [row("Action", "Deactivate Store"), row("Store ID", p.store_id)].join("");
      return [
        row("Bank Store Code", p.bank_store_code),
        row("Store Name", p.store_name),
        row("Customer ID", p.customer_id),
        row("Customer Name", p.customer_name),
        row("Account No", p.account_no),
        row("SOL ID", p.sol_id),
        row("Daily Pickup Limit", p.daily_pickup_limit),
        row("Effective From", p.effective_from),
      ].join("");
    },
    STORE_MAPPING: () => {
      if (p.action === "DEACTIVATE") return row("Action", "Deactivate");
      return [
        row("Vendor", vendorName(p.vendor_id) || p.vendor_id),
        row("Vendor Store Code", p.vendor_store_code),
        row("Bank Store Code", p.bank_store_code),
        row("Customer ID", p.customer_id),
        row("Customer Name", p.customer_name),
        row("Account No", p.account_no),
        row("Effective From", p.effective_from),
      ].join("");
    },
    VENDOR_FILE_FORMAT: () =>
      [
        row("Vendor", vendorName(p.vendor_id) || p.vendor_id),
        row("Format Name", p.format_name),
        formatHeaderMapping(p.header_mapping_json),
        row("Effective From", p.effective_from),
      ].join(""),
    CHARGE_CONFIG: () =>
      [
        row("Config Code", p.config_code),
        row("Config Name", p.config_name),
        row("Value Number", p.value_number),
        row("Value Text", p.value_text),
        row("Effective From", p.effective_from),
      ].join(""),
    VENDOR_CHARGE: () =>
      [
        row("Vendor", vendorName(p.vendor_id) || p.vendor_id),
        row("Pickup Type", p.pickup_type),
        row("Base Charge", p.base_charge),
        row("Effective From", p.effective_from),
      ].join(""),
    WAIVER: () =>
      [
        row("Customer ID", p.customer_id),
        row("Waiver Type", p.waiver_type),
        row("Waiver Percentage", p.waiver_percentage),
        row("Waiver Cap Amount", p.waiver_cap_amount),
        row("Waiver From", p.waiver_from),
        row("Waiver To", p.waiver_to),
      ].join(""),
    PICKUP_RULE: () =>
      [
        row("Pickup Type", p.pickup_type),
        row("Free Limit", p.free_limit),
        row("Effective From", p.effective_from),
      ].join(""),
    REMITTANCE: () =>
      [
        row("Remittance ID", p.remittance_id),
        row("Action", p.action),
        row("Rejection Reason", p.rejection_reason),
      ].join(""),
    EXCEPTION_RESOLUTION: () =>
      [
        row("Exception ID", p.exception_id),
        row("Proposed Status", p.proposed_status),
        row("Remarks", p.remarks),
      ].join(""),
    RECONCILIATION_CORRECTION: () => {
      let detailsHtml = row("Details", p.details);
      if (p.requested_action === "AMOUNT_EDIT" && p.details) {
        try {
          const d = typeof p.details === "string" ? JSON.parse(p.details) : p.details;
          if (d && typeof d === "object") {
            detailsHtml = [
              row("Vendor Amount", d.vendor_amount),
              row("Finacle Amount", d.finacle_amount),
            ].join("");
          }
        } catch (_) {}
      }
      return [row("Requested Action", p.requested_action), detailsHtml].join("");
    },
  };

  const fn = entityConfig[entityType];
  if (fn) {
    const html = fn();
    if (html) return `<div class="maker-entered">${html}</div>`;
  }

  const fallback = Object.entries(p)
    .filter(([k]) => !SKIP_FIELDS.includes(k))
    .map(([k, v]) => row(k, v))
    .join("");
  return fallback ? `<div class="maker-entered">${fallback}</div>` : "<em>No data</em>";
};

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

const labelKey = (key) =>
  key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const formatVendorFileConfigModal = (proposed, vendorLookup) => {
  if (!proposed || typeof proposed !== "object") return "<p>No data</p>";
  const p = proposed;
  const vName = (id) => {
    if (!id) return "";
    const v = vendorLookup[String(id)];
    return v ? `${v.name || v.code || id}` : id;
  };

  let headerRows = "";
  if (p.header_mapping_json) {
    try {
      const obj = typeof p.header_mapping_json === "string" ? JSON.parse(p.header_mapping_json) : p.header_mapping_json;
      if (obj && typeof obj === "object") {
        headerRows = Object.entries(obj)
          .map(
            ([k, v]) =>
              `<tr><td class="config-key">${escapeHtml(labelKey(k))}</td><td>${escapeHtml(String(v))}</td></tr>`
          )
          .join("");
      }
    } catch (_) {
      headerRows = `<tr><td colspan="2">${escapeHtml(String(p.header_mapping_json))}</td></tr>`;
    }
  }

  return `
    <div class="config-modal-section">
      <table class="config-modal-table">
        <tr><td class="config-key">Vendor</td><td>${escapeHtml(vName(p.vendor_id) || String(p.vendor_id || ""))}</td></tr>
        <tr><td class="config-key">Format Name</td><td>${escapeHtml(p.format_name || "")}</td></tr>
        <tr><td class="config-key">Effective From</td><td>${escapeHtml(String(p.effective_from || ""))}</td></tr>
      </table>
    </div>
    <div class="config-modal-section">
      <h3 class="config-modal-subtitle">Header Mapping</h3>
      <table class="config-modal-table config-mapping-table">
        <thead><tr><th>Field</th><th>Source Column</th></tr></thead>
        <tbody>${headerRows || "<tr><td colspan=\"2\">No mapping defined</td></tr>"}</tbody>
      </table>
    </div>
  `;
};

const showVendorFileConfigModal = (proposed) => {
  const modal = document.getElementById("vendor-file-config-modal");
  const body = document.getElementById("vendor-file-config-body");
  if (!modal || !body) return;
  body.innerHTML = formatVendorFileConfigModal(proposed, vendorLookup);
  modal.hidden = false;
  modal.classList.add("approval-modal-visible");
};

const hideVendorFileConfigModal = () => {
  const modal = document.getElementById("vendor-file-config-modal");
  if (!modal) return;
  modal.hidden = true;
  modal.classList.remove("approval-modal-visible");
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

const getFilteredApprovals = () => {
  const q = (approvalSearchInput?.value || "").trim().toLowerCase();
  if (!q) return approvalsCache;
  return approvalsCache.filter((item) =>
    String(item.approval_id || "").toLowerCase().includes(q)
  );
};

const renderApprovalRows = (approvals) => {
  approvalRows.innerHTML = "";
  if (!approvals.length) {
    const q = (approvalSearchInput?.value || "").trim();
    approvalMessage.textContent = q
      ? `No requests match Request ID "${q}".`
      : "No pending approvals.";
    approvalMessage.style.color = q ? "#5a6b86" : "#0f4c81";
    return;
  }

  approvals.forEach((item) => {
      const tr = document.createElement("tr");
      const history = formatHistory(item.comments_history);
      const proposed = parseProposedData(item.proposed_data);
      const makerEnteredHtml = formatMakerEntered(item.entity_type, proposed, vendorLookup);
      const viewBtn =
        item.entity_type === "VENDOR_FILE_FORMAT"
          ? `<button type="button" class="secondary-btn" data-view-vendor-config>View</button>`
          : "";
      tr.innerHTML = `
        <td>${item.approval_id}</td>
        <td>${item.entity_type}</td>
        <td>${item.maker_id}</td>
        <td class="maker-entered-cell">${makerEnteredHtml}</td>
        <td>${item.reason ?? ""}</td>
        <td><span class="status pending">${item.status}</span></td>
        <td>${item.created_date ?? ""}</td>
        <td>${history}</td>
        <td><input type="text" class="approval-comment" placeholder="Comment" /></td>
        <td class="button-row">
          ${viewBtn}
          <button class="secondary-btn" data-action="APPROVE">Approve</button>
          <button class="secondary-btn" data-action="REJECT">Reject</button>
          <button class="secondary-btn" data-action="CLARIFY">Clarify</button>
        </td>
      `;

      const viewBtnEl = tr.querySelector("[data-view-vendor-config]");
      if (viewBtnEl) {
        viewBtnEl.addEventListener("click", () => showVendorFileConfigModal(proposed));
      }

      tr.querySelectorAll("[data-action]").forEach((button) => {
        button.addEventListener("click", async () => {
          const comment = tr.querySelector(".approval-comment").value.trim();
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
      approvalRows.appendChild(tr);
    });

  approvalMessage.textContent = "";
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
    approvalsCache = await response.json();
    renderApprovalRows(getFilteredApprovals());
  } catch (error) {
    approvalMessage.textContent = "Unable to load approvals.";
    approvalMessage.style.color = "#b42318";
  }
};

const init = async () => {
  await loadVendorsForApprovals();
  loadApprovals();

  approvalSearchInput?.addEventListener("input", () => {
    renderApprovalRows(getFilteredApprovals());
  });

  const modal = document.getElementById("vendor-file-config-modal");
  if (modal) {
    modal.querySelector(".approval-modal-backdrop")?.addEventListener("click", hideVendorFileConfigModal);
    modal.querySelector(".approval-modal-close")?.addEventListener("click", hideVendorFileConfigModal);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("approval-modal-visible")) {
        hideVendorFileConfigModal();
      }
    });
  }
};

init();
