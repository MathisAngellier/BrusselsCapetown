import { getCurrentLanguage } from "./language.js";

const countriesCache = new Map();

function getCountriesPath(language) {
  return language === "fr" ? "/data/countries_fr.json" : "/data/countries_en.json";
}

async function getCountriesData() {
  const lang = getCurrentLanguage();

  const file = lang === "fr" ? "/data/countries_fr.json" : "/data/countries_en.json";

  const response = await fetch(file);
  const data = await response.json();

  return data.countries;
}

document.addEventListener("DOMContentLoaded", async () => {
  const track = document.getElementById("countries-select-carousel");
  const countryDetailsElement = document.getElementById("country-details");
  const nextButton = document.querySelector(".button-next");
  const prevButton = document.querySelector(".button-prev");

  const detailsElements = {
    name: document.getElementById("selected-country-name"),
    overview: document.getElementById("country-overview"),
    climate: document.getElementById("country-climate"),
    documents: document.getElementById("country-documents"),
    language: document.getElementById("country-language"),
    currency: document.getElementById("country-currency"),
    customs: document.getElementById("country-customs"),
    health: document.getElementById("country-health"),
    sources: document.getElementById("country-sources"),
    emergencyNumbers: document.querySelector(".emergency-numbers"),
    hospitals: document.querySelector(".hospitals"),
    embassies: document.querySelector(".embassies"),
  };

  if (!track || !countryDetailsElement || !detailsElements.name) return;

  let countries = [];
  let currentIndex = 0;
  let allSlides = [];
  const clonesAtStart = 2;
  const clonesAtEnd = 2;
  let resizeTimeout;

  async function loadCountriesForLanguage(language = getCurrentLanguage()) {
    try {
      countries = await getCountriesData(language);
      generateSlides();
      selectCountry(0);
    } catch (error) {
      console.error("Error loading countries:", error);
    }
  }

  await initializeLanguage(loadCountriesForLanguage);
  await loadCountriesForLanguage();

  function generateSlides() {
    if (!countries.length) return;

    track.innerHTML = "";
    const totalSlides = countries.length;

    for (let i = totalSlides - clonesAtStart; i < totalSlides; i++) {
      createSlide(countries[i], i);
    }

    countries.forEach((country, index) => createSlide(country, index));

    for (let i = 0; i < clonesAtEnd; i++) {
      createSlide(countries[i], i);
    }

    allSlides = Array.from(track.children);
    currentIndex = clonesAtStart;

    requestAnimationFrame(() => {
      updateCarousel(false);
      playActiveVideo();
    });
  }

  function createSlide(country, originalIndex) {
    const slide = document.createElement("div");
    slide.className = "carousel-slide";
    slide.dataset.originalIndex = originalIndex;

    const video = document.createElement("video");
    video.className = "flagVideo";
    video.src = country.video;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";

    slide.appendChild(video);
    track.appendChild(slide);

    slide.addEventListener("click", () => {
      selectCountry(originalIndex);
      centerSlide(originalIndex);
    });
  }

  function updateCarousel(animate = true) {
    if (!allSlides.length) return;

    track.style.transition = animate ? "transform 0.5s ease" : "none";

    const slideWidth = allSlides[0].offsetWidth;
    const offset = (currentIndex - clonesAtStart) * slideWidth;
    track.style.transform = `translateX(-${offset}px)`;

    allSlides.forEach((slide, index) => {
      slide.classList.toggle("active", index === currentIndex);

      const video = slide.querySelector("video");
      if (!video) return;

      if (index === currentIndex) {
        video.currentTime = 0;
        playVideo(video);
      } else {
        video.pause();
        video.currentTime = 0;
      }
    });
  }

  function playActiveVideo() {
    const activeVideo = allSlides[currentIndex]?.querySelector("video");
    playVideo(activeVideo);
  }

  function playVideo(video) {
    if (!video) return;

    video.play().catch(() => {
      document.body.addEventListener("click", () => video.play().catch(() => {}), { once: true });
    });
  }

  function setText(element, text) {
    if (element) element.textContent = text;
  }

  function selectCountry(countryIndex) {
    const country = countries[countryIndex];
    if (!country) return;

    const details = country.details || {};
    countryDetailsElement.style.display = "grid";

    setText(detailsElements.name, country.name);
    setText(detailsElements.overview, details.overview || "No information available.");
    setText(detailsElements.climate, details.climate?.content || "No climate information available.");
    setText(detailsElements.documents, details.documents?.content || "No document information available.");
    setText(detailsElements.language, details.language?.content || "No language information available.");
    setText(detailsElements.currency, details.language?.content2 || "No currency information available.");
    setText(detailsElements.customs, details.customs?.content || "No customs information available.");
    setText(detailsElements.health, details.health?.content || "No health information available.");
    setText(detailsElements.sources, details.sources?.content || "No sources available.");

    updateEmergencyInfo(details.emergency);
  }

  function clearList(list) {
    if (list) list.innerHTML = "";
  }

  function appendListItem(list, html) {
    if (!list) return;
    const li = document.createElement("li");
    li.innerHTML = html;
    list.appendChild(li);
  }

  function updateEmergencyInfo(emergency) {
    clearList(detailsElements.emergencyNumbers);
    clearList(detailsElements.hospitals);
    clearList(detailsElements.embassies);

    emergency?.emergencyNumbers?.forEach((item) => {
      appendListItem(detailsElements.emergencyNumbers, `<strong>${item.service}:</strong> ${item.numbers.join(", ")}`);
    });

    emergency?.hospitals?.forEach((hospital) => {
      appendListItem(detailsElements.hospitals, `<strong>${hospital.name}</strong> (${hospital.location})<br>${hospital.description}`);
    });

    emergency?.embassiesAndInstitutions?.forEach((institution) => {
      const lines = [`<strong>${institution.name}</strong>${institution.type ? ` (${institution.type})` : ""}`];
      if (institution.address) lines.push(institution.address);
      if (institution.phone) lines.push(institution.phone.join(", "));
      if (institution.email) lines.push(institution.email);
      if (institution.website) lines.push(institution.website);
      appendListItem(detailsElements.embassies, lines.join("<br>"));
    });
  }

  function centerSlide(countryIndex) {
    const matchingSlides = allSlides.map((slide, index) => ({ slide, index })).filter(({ slide }) => Number(slide.dataset.originalIndex) === countryIndex);

    if (!matchingSlides.length) return;

    currentIndex = matchingSlides.reduce((best, item) => {
      const currentDistance = Math.abs(item.index - currentIndex);
      const bestDistance = Math.abs(best.index - currentIndex);
      return currentDistance < bestDistance ? item : best;
    }).index;

    updateCarousel();
    resetCarouselPositionIfNeeded();
  }

  function resetCarouselPositionIfNeeded() {
    const totalSlides = allSlides.length;

    if (currentIndex >= totalSlides - clonesAtEnd) {
      setTimeout(() => {
        currentIndex = clonesAtStart + (currentIndex - (totalSlides - clonesAtEnd));
        updateCarousel(false);
      }, 500);
    } else if (currentIndex < clonesAtStart) {
      setTimeout(() => {
        currentIndex = totalSlides - clonesAtEnd - 1 - (clonesAtStart - 1 - currentIndex);
        updateCarousel(false);
      }, 500);
    }
  }

  function showCurrentCountry() {
    const countryIndex = Number(allSlides[currentIndex]?.dataset.originalIndex);
    if (!Number.isNaN(countryIndex)) selectCountry(countryIndex);
  }

  function nextSlide() {
    currentIndex += 1;
    updateCarousel();
    showCurrentCountry();
    resetCarouselPositionIfNeeded();
  }

  function prevSlide() {
    currentIndex -= 1;
    updateCarousel();
    showCurrentCountry();
    resetCarouselPositionIfNeeded();
  }

  nextButton?.addEventListener("click", nextSlide);
  prevButton?.addEventListener("click", prevSlide);

  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => updateCarousel(false), 150);
  });
});
