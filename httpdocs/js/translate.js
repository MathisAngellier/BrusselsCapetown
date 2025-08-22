document.addEventListener("DOMContentLoaded", async function () {
  await initializeLanguage();

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      switchLanguage(btn.dataset.lang);
      location.reload();
    });
  });
});

async function loadTranslations() {
  try {
    const basePath = window.location.pathname.includes("/views/") ? "../data/translations.json" : "data/translations.json";
    const response = await fetch(basePath);
    translations = await response.json();
  } catch (error) {
    console.error("Error loading translations:", error);
  }
}

function updateStaticTexts() {
  const elements = document.querySelectorAll("[data-translate]");
  elements.forEach((element) => {
    const key = element.getAttribute("data-translate");
    if (translations[currentLanguage] && translations[currentLanguage][key]) {
      const text = translations[currentLanguage][key];
      if (element.tagName === "INPUT" && element.type === "submit") {
        element.value = text;
      } else if (element.placeholder !== undefined) {
        element.placeholder = text;
      } else {
        if (text.includes("<") && text.includes(">")) {
          element.innerHTML = text;
        } else {
          element.textContent = text;
        }
      }
    }
  });
}

async function switchLanguage(lang) {
  if (lang === currentLanguage) return;

  currentLanguage = lang;
  localStorage.setItem("selectedLanguage", lang);

  updateStaticTexts();

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });
}

async function initializeLanguage() {
  const savedLang = localStorage.getItem("selectedLanguage") || "en";
  currentLanguage = savedLang;

  await loadTranslations();

  updateStaticTexts();
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === currentLanguage);
  });
}
