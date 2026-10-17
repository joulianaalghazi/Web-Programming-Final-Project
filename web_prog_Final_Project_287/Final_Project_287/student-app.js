function initNavToggle() {
  const layout = document.getElementById("layout");
  const bars = document.getElementById("bars");
  const times = document.getElementById("times");

  if (!layout || !bars || !times) return;

  bars.addEventListener("click", () => layout.classList.remove("collapsed"));
  times.addEventListener("click", () => layout.classList.add("collapsed"));
}

function checkStudentAuth() {
  const student = localStorage.getItem("studentUser");
  if (!student) {
    window.location.href = "student-login.html";
  }
}

function initLogout() {
  const signOutBtn = document.getElementById("sign");
  if (!signOutBtn) return;

  signOutBtn.addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem("studentUser");
    window.location.href = "welcome.html";
  });
}

function initStudentName() {
  const student = JSON.parse(localStorage.getItem("studentUser") || "{}");
  const nameEl = document.getElementById("studentName");

  if (!nameEl) return;
  nameEl.textContent = student.name || "";
}

document.addEventListener("DOMContentLoaded", () => {
  checkStudentAuth();
  initNavToggle();
  initLogout();
  initStudentName();
});