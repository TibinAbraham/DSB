const cleanupForm = document.querySelector("#admin-cleanup-form");
const cleanupMessage = document.querySelector("#admin-cleanup-message");
const cleanupResult = document.querySelector("#admin-cleanup-result");
const userAddForm = document.querySelector("#user-add-form");
const userAddMessage = document.querySelector("#user-add-message");
const userListRows = document.querySelector("#user-list-rows");
const userListMessage = document.querySelector("#user-list-message");
const apiBase = window.API_BASE || "";

cleanupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  cleanupMessage.textContent = "";
  cleanupResult.textContent = "";

  const formData = new FormData(cleanupForm);
  const targets = formData.getAll("targets");
  const reason = formData.get("reason")?.trim();
  const confirmText = formData.get("confirm")?.trim();

  if (!targets.length) {
    cleanupMessage.textContent = "Select at least one data area.";
    cleanupMessage.style.color = "#b42318";
    return;
  }
  if (!reason) {
    cleanupMessage.textContent = "Reason is required.";
    cleanupMessage.style.color = "#b42318";
    return;
  }
  if (confirmText !== "CONFIRM") {
    cleanupMessage.textContent = 'Type "CONFIRM" to proceed.';
    cleanupMessage.style.color = "#b42318";
    return;
  }

  cleanupMessage.textContent = "Clearing data...";
  cleanupMessage.style.color = "#0f4c81";

  try {
    const response = await fetch(`${apiBase}/api/admin/cleanup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
      body: JSON.stringify({
        targets,
        reason,
        confirm_text: confirmText,
      }),
    });
    if (!response.ok) {
      let detail = "";
      try {
        const data = await response.json();
        detail = data?.detail || "";
      } catch (error) {
        detail = "";
      }
      cleanupMessage.textContent = detail || "Cleanup failed.";
      cleanupMessage.style.color = "#b42318";
      return;
    }
    const data = await response.json();
    cleanupMessage.textContent = "Cleanup completed.";
    cleanupMessage.style.color = "#0f4c81";
    cleanupResult.textContent = JSON.stringify(data.deleted || {}, null, 2);
    cleanupForm.reset();
  } catch (error) {
    cleanupMessage.textContent = "Cleanup failed.";
    cleanupMessage.style.color = "#b42318";
  }
});

const loadUsers = async () => {
  if (!userListRows) return;
  userListRows.innerHTML = "";
  userListMessage.textContent = "";
  try {
    const response = await fetch(`${apiBase}/api/users`, {
      headers: window.getAuthHeaders(),
    });
    if (!response.ok) throw new Error("Failed to load users");
    const users = await response.json();
    if (!users.length) {
      userListMessage.textContent = "No users with access. Add users above.";
      return;
    }
    const currentUser = JSON.parse(sessionStorage.getItem("currentUser") || "{}");
    const currentId = currentUser.employeeId;
    userListRows.innerHTML = users
      .map(
        (u) => {
          const isSelf = u.employee_id === currentId;
          return `
      <tr>
        <td>${u.employee_id || ""}</td>
        <td>${u.full_name || ""}</td>
        <td>${u.role_code || ""}</td>
        <td>${u.status || ""}</td>
        <td>${u.last_login_date ? u.last_login_date.slice(0, 10) : "-"}</td>
        <td class="button-row">
          ${u.status === "ACTIVE" ? (isSelf ? "<span class=\"form-message\">(you)</span>" : `<button class="secondary-btn user-deactivate" data-user-id="${u.user_id}">Deactivate</button>`) : `<button class="secondary-btn user-activate" data-user-id="${u.user_id}">Activate</button>`}
          <select class="user-role-select" data-user-id="${u.user_id}" ${u.status !== "ACTIVE" ? "disabled" : ""} style="min-width: 100px;">
            <option value="MAKER" ${u.role_code === "MAKER" ? "selected" : ""}>MAKER</option>
            <option value="CHECKER" ${u.role_code === "CHECKER" ? "selected" : ""}>CHECKER</option>
            <option value="ADMIN" ${u.role_code === "ADMIN" ? "selected" : ""}>ADMIN</option>
            <option value="AUDITOR" ${u.role_code === "AUDITOR" ? "selected" : ""}>AUDITOR</option>
          </select>
        </td>
      </tr>
    `;
        },
      )
      .join("");
    userListRows.querySelectorAll(".user-deactivate").forEach((btn) => {
      btn.addEventListener("click", () => deactivateUser(Number(btn.dataset.userId)));
    });
    userListRows.querySelectorAll(".user-activate").forEach((btn) => {
      btn.addEventListener("click", () => activateUser(Number(btn.dataset.userId)));
    });
    userListRows.querySelectorAll(".user-role-select").forEach((sel) => {
      sel.addEventListener("change", () => updateRole(Number(sel.dataset.userId), sel.value));
    });
  } catch (error) {
    userListMessage.textContent = error.message || "Unable to load users.";
    userListMessage.style.color = "#b42318";
  }
};

const deactivateUser = async (userId) => {
  try {
    const response = await fetch(`${apiBase}/api/users/${userId}/deactivate`, {
      method: "PATCH",
      headers: window.getAuthHeaders(),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || "Deactivate failed");
    }
    loadUsers();
  } catch (error) {
    userListMessage.textContent = error.message || "Deactivate failed.";
    userListMessage.style.color = "#b42318";
  }
};

const activateUser = async (userId) => {
  try {
    const response = await fetch(`${apiBase}/api/users/${userId}/activate`, {
      method: "PATCH",
      headers: window.getAuthHeaders(),
    });
    if (!response.ok) throw new Error("Activate failed");
    loadUsers();
  } catch (error) {
    userListMessage.textContent = error.message || "Activate failed.";
    userListMessage.style.color = "#b42318";
  }
};

const updateRole = async (userId, roleCode) => {
  try {
    const response = await fetch(`${apiBase}/api/users/${userId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
      body: JSON.stringify({ role_code: roleCode }),
    });
    if (!response.ok) throw new Error("Update role failed");
    loadUsers();
  } catch (error) {
    userListMessage.textContent = error.message || "Update role failed.";
    userListMessage.style.color = "#b42318";
  }
};

if (userAddForm) {
  userAddForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(userAddForm);
    userAddMessage.textContent = "Adding user...";
    userAddMessage.style.color = "#0f4c81";
    try {
      const response = await fetch(`${apiBase}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
        body: JSON.stringify({
          employee_id: fd.get("employeeId")?.trim(),
          full_name: fd.get("fullName")?.trim(),
          role_code: fd.get("roleCode")?.trim(),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Add user failed");
      }
      userAddMessage.textContent = "User added. They can now log in with Bank AD.";
      userAddForm.reset();
      loadUsers();
    } catch (error) {
      userAddMessage.textContent = error.message || "Add user failed.";
      userAddMessage.style.color = "#b42318";
    }
  });
}

loadUsers();
