const reportMessage = document.querySelector("#report-message");
const API_BASE = window.API_BASE || "";

const triggerDownload = async (reportKey) => {
  reportMessage.textContent = "Preparing report...";
  reportMessage.style.color = "#0f4c81";

  try {
    const response = await fetch(`${API_BASE}/api/reports/${reportKey}`, {
      headers: window.getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error("Report failed");
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${reportKey}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
    reportMessage.textContent = "Report downloaded.";
  } catch (error) {
    reportMessage.textContent = "Unable to download report.";
    reportMessage.style.color = "#b42318";
  }
};

document.querySelectorAll("[data-report]").forEach((button) => {
  button.addEventListener("click", () => {
    triggerDownload(button.dataset.report);
  });
});
