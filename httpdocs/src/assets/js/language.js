let currentLanguage = localStorage.getItem("selectedLanguage") || "en";
let translationsCache = null;
let loadPromise = null;
const languageChangeCallbacks = new Set();

function getTranslationsPath() {
  return "/data/translations.json";
}

async function loadTranslations() {
  if (translationsCache) return translationsCache;
  if (!loadPromise) {
    loadPromise = fetch(getTranslationsPath())
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        translationsCache = data;
        return translationsCache;
      })
      .catch((error) => {
        console.error("Error loading translations:", error);
        translationsCache = {};
        return translationsCache;
      });
  }
  return loadPromise;
}

function updateLanguageButtons() {
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === currentLanguage);
  });
}

function updateStaticTexts() {
  if (!translationsCache || !translationsCache[currentLanguage]) return;

  document.querySelectorAll("[data-translate]").forEach((element) => {
    const key = element.getAttribute("data-translate");
    const text = translationsCache[currentLanguage][key];
    if (!text) return;

    if (element.tagName === "INPUT" && element.type === "submit") {
      element.value = text;
    } else if (element.placeholder !== undefined) {
      element.placeholder = text;
    } else if (text.includes("<") && text.includes(">")) {
      element.innerHTML = text;
    } else {
      element.textContent = text;
    }
  });
}

export function getCurrentLanguage() {
  return currentLanguage;
}

export async function setLanguage(lang) {
  if (!lang || lang === currentLanguage) return currentLanguage;

  currentLanguage = lang;
  localStorage.setItem("selectedLanguage", lang);
  await loadTranslations();
  updateStaticTexts();
  updateLanguageButtons();

  for (const callback of languageChangeCallbacks) {
    await callback(currentLanguage);
  }

  return currentLanguage;
}

export async function initializeLanguage(onLanguageChange) {
  if (typeof onLanguageChange === "function") {
    languageChangeCallbacks.add(onLanguageChange);
  }

  currentLanguage = localStorage.getItem("selectedLanguage") || "en";
  await loadTranslations();
  updateStaticTexts();
  updateLanguageButtons();

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    if (btn.dataset.languageListenerAttached === "true") return;
    btn.dataset.languageListenerAttached = "true";

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      await setLanguage(btn.dataset.lang);
    });
  });

  return currentLanguage;
}

window.switchLanguage = setLanguage;
window.initializeLanguage = initializeLanguage;

document.addEventListener("DOMContentLoaded", () => {
  initializeLanguage();
});
