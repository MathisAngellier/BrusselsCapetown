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

// Load translations for static content
async function loadTranslations() {
  try {
    // Get the current script's path and resolve the correct URL
    const basePath = window.location.pathname.includes("/views/") ? "../data/translations.json" : "data/translations.json";
    const response = await fetch(basePath);
    translations = await response.json();
  } catch (error) {
    console.error("Error loading translations:", error);
  }
}

// Update static text elements
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
        // Check if the translation contains HTML tags
        if (text.includes("<") && text.includes(">")) {
          element.innerHTML = text; // Use innerHTML for HTML content
        } else {
          element.textContent = text; // Use textContent for plain text
        }
      }
    }
  });
}

// Switch language function
async function switchLanguage(lang) {
  if (lang === currentLanguage) return;

  currentLanguage = lang;
  localStorage.setItem("selectedLanguage", lang);

  // Update static texts
  updateStaticTexts();

  // Update active language button
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });
}

// Initialize language on page load
async function initializeLanguage() {
  // Check for saved language preference
  const savedLang = localStorage.getItem("selectedLanguage") || "en";
  currentLanguage = savedLang;

  // Load translations
  await loadTranslations();

  // Update UI
  updateStaticTexts();
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === currentLanguage);
  });
}
