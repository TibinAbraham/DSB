const exceptionForm = document.querySelector("#exception-form");
const exceptionMessage = document.querySelector("#exception-message");
const resolutionForm = document.querySelector("#exception-resolution-form");
const resolutionMessage = document.querySelector("#exception-resolution-message");
const exceptionRows = document.querySelector("#exception-rows");
const API_BASE = window.API_BASE || "";

const currentUser = () =>
  sessionStorage.getItem("currentUser")
    ? JSON.parse(sessionStorage.getItem("currentUser"))
    : { employeeId: "SYSTEM" };

exceptionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  exceptionMessage.textContent = "Submitting...";
  exceptionMessage.style.color = "#0f4c81";

  const data = new FormData(exceptionForm);
  try {
    const response = await fetch(`${API_BASE}/api/exceptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
      body: JSON.stringify({
        recon_id: Number(data.get("reconId")),
        exception_type: data.get("exceptionType"),
        details: data.get("details") || null,
        maker_id: currentUser().employeeId,
      }),
    });
    if (!response.ok) throw new Error();
    exceptionMessage.textContent = "Exception created.";
    exceptionForm.reset();
  } catch (error) {
    exceptionMessage.textContent = "Request failed.";
    exceptionMessage.style.color = "#b42318";
  }
});

resolutionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  resolutionMessage.textContent = "Submitting...";
  resolutionMessage.style.color = "#0f4c81";

  const data = new FormData(resolutionForm);
  try {
    const response = await fetch(`${API_BASE}/api/exceptions/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...window.getAuthHeaders() },
      body: JSON.stringify({
        exception_id: Number(data.get("exceptionId")),
        proposed_status: data.get("proposedStatus"),
        remarks: data.get("remarks") || null,
        maker_id: currentUser().employeeId,
      }),
    });
    if (!response.ok) throw new Error();
    resolutionMessage.textContent = "Resolution requested.";
    resolutionForm.reset();
  } catch (error) {
    resolutionMessage.textContent = "Request failed.";
    resolutionMessage.style.color = "#b42318";
  }
});

const loadExceptions = async () => {
  const response = await fetch(`${API_BASE}/api/exceptions?status_filter=OPEN`, {
    headers: window.getAuthHeaders(),
  });
  if (!response.ok) {
    exceptionRows.innerHTML = "";
    return;
  }
  const items = await response.json();
  exceptionRows.innerHTML = items
    .map(
      (item) =>
        `<tr>
          <td>${item.exception_id}</td>
          <td>${item.recon_id ?? ""}</td>
          <td>${item.exception_type}</td>
          <td>${item.status}</td>
        </tr>`,
    )
    .join("");
};

loadExceptions();
