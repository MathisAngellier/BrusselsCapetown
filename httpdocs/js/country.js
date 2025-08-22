let currentLanguage = "en"; // Default language
let translations = {};

async function loadTranslations() {
  try {
    const response = await fetch("../data/translations.json");
    translations = await response.json();
  } catch (error) {
    console.error("Error loading translations:", error);
  }
}

function getCountriesData() {
  const dataFile = currentLanguage === "fr" ? "../data/countries_fr.json" : "../data/countries_en.json";
  return fetch(dataFile)
    .then((response) => response.json())
    .then((data) => data.countries);
}

function updateStaticTexts() {
  const elements = document.querySelectorAll("[data-translate]");
  elements.forEach((element) => {
    const key = element.getAttribute("data-translate");
    if (translations[currentLanguage] && translations[currentLanguage][key]) {
      if (element.tagName === "INPUT" && element.type === "submit") {
        element.value = translations[currentLanguage][key];
      } else if (element.placeholder !== undefined) {
        element.placeholder = translations[currentLanguage][key];
      } else {
        element.textContent = translations[currentLanguage][key];
      }
    }
  });
}

async function switchLanguage(lang) {
  if (lang === currentLanguage) return;

  currentLanguage = lang;
  localStorage.setItem("selectedLanguage", lang);

  updateStaticTexts();

  try {
    countries = await getCountriesData();
    generateSlides();
    selectCountry(0);
  } catch (error) {
    console.error("Error loading countries for language:", lang, error);
  }

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

  let countries = [];
  let currentIndex = 0;
  let allSlides = [];

  await initializeLanguage();

  try {
    countries = await getCountriesData();
    generateSlides();
    selectCountry(0);
  } catch (error) {
    console.error("Error loading countries:", error);
  }

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      switchLanguage(btn.dataset.lang);
      location.reload();
    });
  });

  function generateSlides() {
    if (!track || !countries || countries.length === 0) return;

    track.innerHTML = "";

    const totalSlides = countries.length;
    const clonesAtStart = 2;
    const clonesAtEnd = 2;

    for (let i = totalSlides - clonesAtStart; i < totalSlides; i++) {
      createSlide(countries[i], i, true);
    }

    countries.forEach((country, index) => {
      createSlide(country, index, false);
    });

    for (let i = 0; i < clonesAtEnd; i++) {
      createSlide(countries[i], i, true);
    }

    allSlides = Array.from(track.children);

    currentIndex = clonesAtStart;
    setTimeout(() => {
      updateCarousel(false);
      setTimeout(() => {
        forceInitialAutoplay();
      }, 200);
    }, 100);
  }

  function forceInitialAutoplay() {
    const activeSlide = allSlides[currentIndex];
    if (activeSlide) {
      const activeVideo = activeSlide.querySelector("video");
      if (activeVideo) {
        activeVideo.muted = true;
        activeVideo.loop = true;
        activeVideo.playsInline = true;
        activeVideo.currentTime = 0;

        const attemptPlay = () => {
          const playPromise = activeVideo.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log("Initial video autoplay successful");
              })
              .catch((error) => {
                console.log("Initial autoplay failed, retrying:", error);
                setTimeout(() => {
                  activeVideo.play().catch(() => {
                    console.log("Retry also failed");
                  });
                }, 100);
              });
          }
        };
        attemptPlay();
      }
    }
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
    video.preload = "auto";

    flagElement = video;

    slide.appendChild(flagElement);
    track.appendChild(slide);

    slide.addEventListener("click", () => {
      selectCountry(originalIndex);
      centerSlide(originalIndex);
    });
  }

  function updateCarousel(animate = true) {
    if (!animate) {
      track.style.transition = "none";
    }

    const slideWidth = allSlides[0].offsetWidth;
    const offset = (currentIndex - 2) * slideWidth;
    track.style.transform = `translateX(-${offset}px)`;

    if (!animate) {
      setTimeout(() => {
        track.style.transition = "transform 0.5s ease";
      }, 50);
    }

    allSlides.forEach((slide, index) => {
      slide.classList.toggle("active", index === currentIndex);
    });

    allSlides.forEach((slide, index) => {
      const video = slide.querySelector("video");
      if (video) {
        video.pause();
        video.currentTime = 0;
      }
    });

    const activeSlide = allSlides[currentIndex];
    if (activeSlide) {
      const activeVideo = activeSlide.querySelector("video");
      if (activeVideo) {
        activeVideo.currentTime = 0;
        playVideo(activeVideo);
      }
    }
  }

  function playVideo(video) {
    if (!video) return;

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        document.body.addEventListener(
          "click",
          () => {
            video.play().catch(() => {});
          },
          { once: true }
        );
      });
    }
  }

  function selectCountry(countryIndex) {
    if (!countries[countryIndex]) return;

    const country = countries[countryIndex];

    countryNameElement.textContent = country.name;

    countryDetailsElement.style.display = "block";

    countryOverviewElement.textContent = country.details?.overview || "No information available.";
    countryClimateElement.textContent = country.details?.climate?.content || "No climate information available.";
    countryDocumentsElement.textContent = country.details?.documents?.content || "No document information available.";
    countryLanguageElement.textContent = country.details?.language?.content || "No language information available.";
    countryCurrencyElement.textContent = country.details?.language?.content2 || "No currency information available.";
    countryCustomsElement.textContent = country.details?.customs?.content || "No customs information available.";
    countryHealthElement.textContent = country.details?.health?.content || "No health information available.";
    countrySourcesElement.textContent = country.details?.sources?.content || "No sources available.";

    updateEmergencyInfo(country.details?.emergency);
  }

  function updateEmergencyInfo(emergency) {
    emergencyNumbersList.innerHTML = "";
    const numbers = emergency?.emergencyNumbers || [];
    numbers.forEach((item) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${item.service}:</strong> ${item.numbers.join(", ")}`;
      emergencyNumbersList.appendChild(li);
    });

    hospitalsList.innerHTML = "";
    const hospitals = emergency?.hospitals || [];
    hospitals.forEach((hospital) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${hospital.name}</strong> (${hospital.location})<br>${hospital.description}`;
      hospitalsList.appendChild(li);
    });

    embassiesList.innerHTML = "";
    const embassies = emergency?.embassiesAndInstitutions || [];
    embassies.forEach((institution) => {
      const li = document.createElement("li");
      let html = `<strong>${institution.name}</strong>`;

      if (institution.type) {
        html += ` (${institution.type})`;
      }

      html += "<br>";

      if (institution.address) html += `Address: ${institution.address}<br>`;
      if (institution.phone) html += `Phone: ${institution.phone.join(", ")}<br>`;
      if (institution.email) html += `Email: ${institution.email}<br>`;
      if (institution.website) html += `Website: ${institution.website}<br>`;

      li.innerHTML = html;
      embassiesList.appendChild(li);
    });
  }

  function centerSlide(countryIndex) {
    const matchingSlides = [];
    allSlides.forEach((slide, index) => {
      if (parseInt(slide.dataset.originalIndex) === countryIndex) {
        matchingSlides.push(index);
      }
    });

    if (matchingSlides.length === 0) return;

    let bestIndex = matchingSlides[0];
    let shortestDistance = Math.abs(matchingSlides[0] - currentIndex);

    matchingSlides.forEach((slideIndex) => {
      const distance = Math.abs(slideIndex - currentIndex);
      if (distance < shortestDistance) {
        shortestDistance = distance;
        bestIndex = slideIndex;
      }
    });

    currentIndex = bestIndex;
    updateCarousel();

    const totalSlides = allSlides.length;
    const clonesAtStart = 2;
    const clonesAtEnd = 2;

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

  function nextSlide() {
    currentIndex++;
    updateCarousel();

    if (currentIndex >= allSlides.length - 2) {
      setTimeout(() => {
        currentIndex = 2;
        updateCarousel(false);
      }, 500);
    }

    const activeSlide = allSlides[currentIndex];
    const countryIndex = parseInt(activeSlide.dataset.originalIndex);
    selectCountry(countryIndex);
  }

  function prevSlide() {
    currentIndex--;
    updateCarousel();

    if (currentIndex < 2) {
      setTimeout(() => {
        currentIndex = allSlides.length - 3;
        updateCarousel(false);
      }, 500);
    }

    const activeSlide = allSlides[currentIndex];
    const countryIndex = parseInt(activeSlide.dataset.originalIndex);
    selectCountry(countryIndex);
  }

  nextButton?.addEventListener("click", nextSlide);
  prevButton?.addEventListener("click", prevSlide);

  window.addEventListener("resize", () => {
    updateCarousel(false);
  });
});
