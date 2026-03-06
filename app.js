const API_BASE = window.API_BASE || "";

const roleConfig = {
  MAKER: [
    "dashboard",
    "uploads",
    "finacle-upload",
    "vendor-upload",
    "mapping",
    "vendor-onboarding",
    "store-onboarding",
    "reconciliation",
    "reconciliation-results",
    "charges",
    "masters",
    "reports",
  ],
  CHECKER: ["dashboard", "approvals", "reconciliation", "reconciliation-results", "charges", "reports"],
  ADMIN: [
    "dashboard",
    "uploads",
    "finacle-upload",
    "vendor-upload",
    "mapping",
    "vendor-onboarding",
    "store-onboarding",
    "reconciliation",
    "reconciliation-results",
    "approvals",
    "masters",
    "charges",
    "reports",
    "admin-tools",
  ],
  AUDITOR: ["dashboard", "reports", "reconciliation", "reconciliation-results", "charges"],
};

window.getAuthHeaders = () => {
  const token = sessionStorage.getItem("authToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const getCurrentUser = () => {
  const stored = sessionStorage.getItem("currentUser");
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch (error) {
    return null;
  }
};

const enforceAuth = async () => {
  const isLoginPage = window.location.pathname.endsWith("index.html");
  if (isLoginPage) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/auth/me`, {
      headers: window.getAuthHeaders(),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        sessionStorage.removeItem("currentUser");
        sessionStorage.removeItem("authToken");
        window.location.replace("index.html");
      }
      return;
    }
    const user = await response.json();
    sessionStorage.setItem("currentUser", JSON.stringify(user));
    applyRoleVisibility(user);
  } catch (error) {
    return;
  }
};

const applyRoleVisibility = (user) => {
  const activeUser = user || getCurrentUser();
  const role = activeUser?.role || "MAKER";
  const allowed = new Set(roleConfig[role] || []);

  document.querySelectorAll("[data-page]").forEach((el) => {
    const pageKey = el.dataset.page;
    el.style.display = allowed.has(pageKey) ? "inline-flex" : "none";
  });

  const userBadge = document.querySelector("[data-user-badge]");
  if (userBadge) {
    const displayName = activeUser?.name || "User";
    const displayId = activeUser?.employeeId ? ` (${activeUser.employeeId})` : "";
    userBadge.textContent = activeUser
      ? `${displayName}${displayId} - ${activeUser.role}`
      : "Guest";
  }

  if (allowed.has("approvals")) {
    updateApprovalNotificationBadge();
  }
};

const updateApprovalNotificationBadge = async () => {
  const approvalsCard = document.querySelector('[data-page="approvals"]');
  if (!approvalsCard) return;

  try {
    const response = await fetch(`${API_BASE}/api/approvals/pending/count`, {
      headers: window.getAuthHeaders(),
    });
    if (!response.ok) return;
    const data = await response.json();
    const count = data?.count ?? 0;

    let badge = approvalsCard.querySelector(".nav-card-badge");
    if (count > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "nav-card-badge";
        badge.setAttribute("aria-live", "polite");
        approvalsCard.appendChild(badge);
      }
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.title = `${count} pending approval${count !== 1 ? "s" : ""}`;
      badge.hidden = false;
    } else if (badge) {
      badge.hidden = true;
    }
  } catch (error) {
    /* ignore */
  }
};

const wireLogout = () => {
  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", () => {
      sessionStorage.removeItem("currentUser");
      sessionStorage.removeItem("authToken");
      window.location.replace("index.html");
    });
  });
};

const hydrateUser = async () => {
  const cached = getCurrentUser();
  if (cached) {
    applyRoleVisibility(cached);
  }

  try {
    const response = await fetch(`${API_BASE}/api/auth/me`, {
      headers: window.getAuthHeaders(),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        sessionStorage.removeItem("currentUser");
        sessionStorage.removeItem("authToken");
        const isLoginPage = window.location.pathname.endsWith("index.html");
        if (!isLoginPage) {
          window.location.replace("index.html");
        }
      }
      return;
    }
    const user = await response.json();
    sessionStorage.setItem("currentUser", JSON.stringify(user));
    applyRoleVisibility(user);
  } catch (error) {
    if (!cached) {
      applyRoleVisibility(null);
    }
  }
};

window.addEventListener("pageshow", () => {
  enforceAuth();
});

enforceAuth();
hydrateUser();
wireLogout();
