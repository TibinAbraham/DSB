const form = document.querySelector("#login-form");
const message = document.querySelector("#form-message");
const passwordInput = document.querySelector("#password-input");
const togglePassword = document.querySelector("#toggle-password");
const API_BASE = window.API_BASE || "";

const handleLoginSuccess = (user) => {
  sessionStorage.setItem(
    "currentUser",
    JSON.stringify({
      employeeId: user.employeeId,
      name: user.name,
      role: user.role,
    }),
  );
  if (user.token) {
    sessionStorage.setItem("authToken", user.token);
  }

  message.textContent = `Welcome, ${user.name}. Redirecting to dashboard...`;
  message.style.color = "#0f4c81";
  window.location.href = "dashboard.html";
};

togglePassword.addEventListener("click", () => {
  const isPassword = passwordInput.type === "password";
  passwordInput.type = isPassword ? "text" : "password";
  togglePassword.textContent = isPassword ? "Hide" : "Show";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const employeeId = formData.get("employeeId").trim();
  const password = formData.get("password").trim();

  if (!employeeId || !password) {
    message.textContent = "Please enter both Employee ID and password.";
    message.style.color = "#b42318";
    return;
  }

  message.textContent = "Signing in...";
  message.style.color = "#0f4c81";

  try {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, password }),
    });

    if (!response.ok) {
      throw new Error("Login failed");
    }

    const user = await response.json();
    handleLoginSuccess(user);
  } catch (error) {
    message.textContent =
      "Auth service unavailable. Please try again or contact admin.";
    message.style.color = "#b42318";
  }
});
