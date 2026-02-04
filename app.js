const API_BASE = window.API_BASE || "";

const roleConfig = {
  MAKER: [
    "dashboard",
    "uploads",
    "finacle-upload",
    "vendor-upload",
    "mapping",
    "vendor-onboarding",
    "reconciliation",
    "reconciliation-results",
    "reports",
  ],
  CHECKER: ["dashboard", "approvals", "reconciliation", "reconciliation-results", "reports"],
  ADMIN: [
    "dashboard",
    "uploads",
    "finacle-upload",
    "vendor-upload",
    "mapping",
    "vendor-onboarding",
    "reconciliation",
    "reconciliation-results",
    "approvals",
    "masters",
    "reports",
    "admin-tools",
  ],
  AUDITOR: ["dashboard", "reports", "reconciliation", "reconciliation-results"],
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
