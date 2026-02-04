const cleanupForm = document.querySelector("#admin-cleanup-form");
const cleanupMessage = document.querySelector("#admin-cleanup-message");
const cleanupResult = document.querySelector("#admin-cleanup-result");
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
