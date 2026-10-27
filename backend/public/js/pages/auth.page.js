
const form = document.querySelector("#auth-form");
const nameGroup = document.querySelector("#name-group");
const nameInput = document.querySelector("#name");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const message = document.querySelector("#auth-message");
const submitButton = document.querySelector("#submit-button");
const loginTab = document.querySelector("#login-tab");
const registerTab = document.querySelector("#register-tab");

let mode = "login";

function setMode(nextMode) {
  mode = nextMode;
  const registering = mode === "register";

  nameGroup.classList.toggle("hidden", !registering);
  nameInput.required = registering;
  passwordInput.autocomplete = registering
    ? "new-password"
    : "current-password";

  loginTab.classList.toggle("active", !registering);
  registerTab.classList.toggle("active", registering);
  submitButton.textContent = registering ? "Create account" : "Login";
  message.textContent = "";
}

loginTab.addEventListener("click", () => setMode("login"));
registerTab.addEventListener("click", () => setMode("register"));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  submitButton.disabled = true;

  try {
    const payload = {
      email: emailInput.value.trim(),
      password: passwordInput.value,
    };

    if (mode === "register") {
      payload.name = nameInput.value.trim();
    }

    const endpoint = mode === "register" ? "register" : "login";

    const response = await fetch(`/api/auth/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || "Authentication failed.");
    }

    window.location.replace("/");
  } catch (error) {
    message.textContent = error.message || "Something went wrong.";
  } finally {
    submitButton.disabled = false;
  }
});
