import { getCurrentLanguage, initializeLanguage } from "./language.js";

const countryDataCache = new Map();

async function getCountriesData(lang = getCurrentLanguage()) {
  if (countryDataCache.has(lang)) return countryDataCache.get(lang);

  const dataFile = lang === "fr" ? "/data/countries_fr.json" : "/data/countries_en.json";
  const response = await fetch(dataFile);

  if (!response.ok) {
    throw new Error(`Could not load ${dataFile}: ${response.status}`);
  }

  const data = await response.json();
  const countries = data.countries || [];
  countryDataCache.set(lang, countries);
  return countries;
}

function setText(element, value, fallback = "No information available.") {
  if (element) element.textContent = value || fallback;
}

function clearElement(element) {
  if (element) element.replaceChildren();
}

function appendStrongLine(list, strongText, normalText = "") {
  if (!list) return;
  const li = document.createElement("li");
  const strong = document.createElement("strong");
  strong.textContent = strongText;
  li.append(strong);
  if (normalText) li.append(document.createTextNode(normalText));
  list.appendChild(li);
}

function appendEmbassy(list, institution) {
  if (!list) return;

  const li = document.createElement("li");
  const strong = document.createElement("strong");
  strong.textContent = institution.name || "Institution";
  li.appendChild(strong);

  if (institution.type) li.append(document.createTextNode(` (${institution.type})`));
  li.appendChild(document.createElement("br"));

  [
    institution.address,
    institution.phone?.join(", "),
    institution.email,
    institution.website,
  ]
    .filter(Boolean)
    .forEach((value) => {
      li.append(document.createTextNode(value));
      li.appendChild(document.createElement("br"));
    });

  list.appendChild(li);
}

document.addEventListener("DOMContentLoaded", async function () {
  const track = document.getElementById("countries-select-carousel");
  const countryNameElement = document.getElementById("selected-country-name");
  const countryDetailsElement = document.getElementById("country-details");

  const countryOverviewElement = document.getElementById("country-overview");
  const countryClimateElement = document.getElementById("country-climate");
  const countryDocumentsElement = document.getElementById("country-documents");
  const countryLanguageElement = document.getElementById("country-language");
  const countryCurrencyElement = document.getElementById("country-currency");
  const countryCustomsElement = document.getElementById("country-customs");
  const countryHealthElement = document.getElementById("country-health");
  const countrySourcesElement = document.getElementById("country-sources");

  const emergencyNumbersList = document.querySelector(".emergency-numbers");
  const hospitalsList = document.querySelector(".hospitals");
  const embassiesList = document.querySelector(".embassies");

  const nextButton = document.querySelector(".button-next");
  const prevButton = document.querySelector(".button-prev");

  const clonesAtStart = 2;
  const clonesAtEnd = 2;
  let countries = [];
  let currentIndex = 0;
  let allSlides = [];
  let resizeTimeout;

  async function refreshCountries() {
    try {
      countries = await getCountriesData();
      generateSlides();
      selectCountry(0);
    } catch (error) {
      console.error("Error loading countries:", error);
    }
  }

  await initializeLanguage(refreshCountries);
  await refreshCountries();

  function generateSlides() {
    if (!track || countries.length === 0) return;

    track.replaceChildren();

    const totalSlides = countries.length;

    for (let i = totalSlides - clonesAtStart; i < totalSlides; i++) {
      createSlide(countries[i], i);
    }

    countries.forEach((country, index) => {
      createSlide(country, index);
    });

    for (let i = 0; i < clonesAtEnd; i++) {
      createSlide(countries[i], i);
    }

    allSlides = Array.from(track.children);
    currentIndex = clonesAtStart;

    setTimeout(() => {
      updateCarousel(false);
      setTimeout(forceInitialAutoplay, 200);
    }, 100);
  }

  function forceInitialAutoplay() {
    const activeVideo = allSlides[currentIndex]?.querySelector("video");
    if (!activeVideo) return;

    activeVideo.muted = true;
    activeVideo.loop = true;
    activeVideo.playsInline = true;
    activeVideo.currentTime = 0;
    playVideo(activeVideo);
  }

  function createSlide(country, originalIndex) {
    if (!track || !country) return;

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
    if (!track || allSlides.length === 0) return;

    if (!animate) track.style.transition = "none";

    const slideWidth = allSlides[0].offsetWidth;
    const offset = (currentIndex - clonesAtStart) * slideWidth;
    track.style.transform = `translateX(-${offset}px)`;

    if (!animate) {
      setTimeout(() => {
        track.style.transition = "transform 0.5s ease";
      }, 50);
    }

    allSlides.forEach((slide, index) => {
      slide.classList.toggle("active", index === currentIndex);
      const video = slide.querySelector("video");
      if (video && index !== currentIndex) {
        video.pause();
        video.currentTime = 0;
      }
    });

    const activeVideo = allSlides[currentIndex]?.querySelector("video");
    if (activeVideo) {
      activeVideo.currentTime = 0;
      playVideo(activeVideo);
    }
  }

  function playVideo(video) {
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        document.body.addEventListener("click", () => video.play().catch(() => {}), { once: true });
      });
    }
  }

  function selectCountry(countryIndex) {
    const country = countries[countryIndex];
    if (!country) return;

    setText(countryNameElement, country.name, "");
    if (countryDetailsElement) countryDetailsElement.style.display = "block";

    setText(countryOverviewElement, country.details?.overview);
    setText(countryClimateElement, country.details?.climate?.content, "No climate information available.");
    setText(countryDocumentsElement, country.details?.documents?.content, "No document information available.");
    setText(countryLanguageElement, country.details?.language?.content, "No language information available.");
    setText(countryCurrencyElement, country.details?.language?.content2, "No currency information available.");
    setText(countryCustomsElement, country.details?.customs?.content, "No customs information available.");
    setText(countryHealthElement, country.details?.health?.content, "No health information available.");
    setText(countrySourcesElement, country.details?.sources?.content, "No sources available.");

    updateEmergencyInfo(country.details?.emergency);
  }

  function updateEmergencyInfo(emergency) {
    clearElement(emergencyNumbersList);
    clearElement(hospitalsList);
    clearElement(embassiesList);

    emergency?.emergencyNumbers?.forEach((item) => {
      appendStrongLine(emergencyNumbersList, `${item.service}:`, ` ${item.numbers.join(", ")}`);
    });

    emergency?.hospitals?.forEach((hospital) => {
      appendStrongLine(hospitalsList, hospital.name, ` (${hospital.location}) - ${hospital.description}`);
    });

    emergency?.embassiesAndInstitutions?.forEach((institution) => {
      appendEmbassy(embassiesList, institution);
    });
  }

  function centerSlide(countryIndex) {
    const matchingSlides = allSlides
      .map((slide, index) => ({ slide, index }))
      .filter(({ slide }) => Number(slide.dataset.originalIndex) === countryIndex)
      .map(({ index }) => index);

    if (matchingSlides.length === 0) return;

    currentIndex = matchingSlides.reduce((bestIndex, slideIndex) => {
      const bestDistance = Math.abs(bestIndex - currentIndex);
      const currentDistance = Math.abs(slideIndex - currentIndex);
      return currentDistance < bestDistance ? slideIndex : bestIndex;
    }, matchingSlides[0]);

    updateCarousel();
    normalizeClonePosition();
  }

  function normalizeClonePosition() {
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

  function showActiveCountry() {
    const activeSlide = allSlides[currentIndex];
    if (!activeSlide) return;

    const countryIndex = Number(activeSlide.dataset.originalIndex);
    selectCountry(countryIndex);
  }

  function nextSlide() {
    if (allSlides.length === 0) return;
    currentIndex++;
    updateCarousel();
    normalizeClonePosition();
    showActiveCountry();
  }

  function prevSlide() {
    if (allSlides.length === 0) return;
    currentIndex--;
    updateCarousel();
    normalizeClonePosition();
    showActiveCountry();
  }

  nextButton?.addEventListener("click", nextSlide);
  prevButton?.addEventListener("click", prevSlide);

  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => updateCarousel(false), 150);
  });
});
