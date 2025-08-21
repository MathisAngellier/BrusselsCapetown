// Language management
let currentLanguage = "en"; // Default language
let translations = {};

// Load translations for static content
async function loadTranslations() {
  try {
    // You'll need to create this translations file
    const response = await fetch("../data/translations.json");
    translations = await response.json();
  } catch (error) {
    console.error("Error loading translations:", error);
  }
}

// Get country data based on current language
function getCountriesData() {
  const dataFile = currentLanguage === "fr" ? "../data/countries_fr.json" : "../data/countries_en.json";
  return fetch(dataFile)
    .then((response) => response.json())
    .then((data) => data.countries);
}

// Update static text elements
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

// Switch language function
async function switchLanguage(lang) {
  if (lang === currentLanguage) return;

  currentLanguage = lang;
  localStorage.setItem("selectedLanguage", lang);

  // Update static texts
  updateStaticTexts();

  // Reload country data
  try {
    countries = await getCountriesData();
    generateSlides();
    selectCountry(0);
  } catch (error) {
    console.error("Error loading countries for language:", lang, error);
  }

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

document.addEventListener("DOMContentLoaded", async function () {
  const track = document.getElementById("countries-select-carousel");
  const countryNameElement = document.getElementById("selected-country-name");
  const countryDetailsElement = document.getElementById("country-details");

  // All country detail elements
  const countryOverviewElement = document.getElementById("country-overview");
  const countryClimateElement = document.getElementById("country-climate");
  const countryDocumentsElement = document.getElementById("country-documents");
  const countryLanguageElement = document.getElementById("country-language");
  const countryCurrencyElement = document.getElementById("country-currency");
  const countryCustomsElement = document.getElementById("country-customs");
  const countryHealthElement = document.getElementById("country-health");
  const countrySourcesElement = document.getElementById("country-sources");

  // Emergency elements
  const emergencyNumbersList = document.querySelector(".emergency-numbers");
  const hospitalsList = document.querySelector(".hospitals");
  const embassiesList = document.querySelector(".embassies");

  const nextButton = document.querySelector(".button-next");
  const prevButton = document.querySelector(".button-prev");

  let countries = [];
  let currentIndex = 0;
  let allSlides = [];

  await initializeLanguage();

  // Then load countries data
  try {
    countries = await getCountriesData();
    generateSlides();
    selectCountry(0);
  } catch (error) {
    console.error("Error loading countries:", error);
  }

  // Add language switch event listeners
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      switchLanguage(btn.dataset.lang);
      location.reload();
    });
  });

  // Replace the sampleCountries array with:

  // Replace your generateSlides function with this updated version
  function generateSlides() {
    if (!track || !countries || countries.length === 0) return;

    // Clear existing slides
    track.innerHTML = "";

    // Create slides for infinite scroll (original + clones at start and end)
    const totalSlides = countries.length;
    const clonesAtStart = 2;
    const clonesAtEnd = 2;

    // Add clones at the start
    for (let i = totalSlides - clonesAtStart; i < totalSlides; i++) {
      createSlide(countries[i], i, true);
    }

    // Add original slides
    countries.forEach((country, index) => {
      createSlide(country, index, false);
    });

    // Add clones at the end
    for (let i = 0; i < clonesAtEnd; i++) {
      createSlide(countries[i], i, true);
    }

    allSlides = Array.from(track.children);

    // Set initial position (accounting for clones at start)
    currentIndex = clonesAtStart;
    setTimeout(() => {
      updateCarousel(false);
      // Force autoplay for the initial slide after everything is set up
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
        // Set video properties to ensure autoplay works
        activeVideo.muted = true;
        activeVideo.loop = true;
        activeVideo.playsInline = true;
        activeVideo.currentTime = 0;

        // Force play with multiple attempts
        const attemptPlay = () => {
          const playPromise = activeVideo.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log("Initial video autoplay successful");
              })
              .catch((error) => {
                console.log("Initial autoplay failed, retrying:", error);
                // Retry after a short delay
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
    video.muted = true; // Ensure it's muted
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto"; // Preload the video

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
    // Center the selected slide by offsetting by 2 slide widths (to show 2 slides on each side)
    const offset = (currentIndex - 2) * slideWidth;
    track.style.transform = `translateX(-${offset}px)`;

    if (!animate) {
      // Re-enable transitions after positioning
      setTimeout(() => {
        track.style.transition = "transform 0.5s ease";
      }, 50);
    }

    // Update active states - the middle slide (position 2 in 0-4 range) should be active
    allSlides.forEach((slide, index) => {
      slide.classList.toggle("active", index === currentIndex);
    });

    // Reset ALL videos first, then play the active one
    allSlides.forEach((slide, index) => {
      const video = slide.querySelector("video");
      if (video) {
        // Reset video to beginning and pause
        video.pause();
        video.currentTime = 0;
      }
    });

    // Then play the active video
    const activeSlide = allSlides[currentIndex];
    if (activeSlide) {
      const activeVideo = activeSlide.querySelector("video");
      if (activeVideo) {
        activeVideo.currentTime = 0; // Reset to start
        playVideo(activeVideo);
      }
    }
  }

  function playVideo(video) {
    if (!video) return;

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Wait for user gesture
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

    // Update country name
    countryNameElement.textContent = country.name;

    // Show country details
    countryDetailsElement.style.display = "block";

    // Update all sections
    countryOverviewElement.textContent = country.details?.overview || "No information available.";
    countryClimateElement.textContent = country.details?.climate?.content || "No climate information available.";
    countryDocumentsElement.textContent = country.details?.documents?.content || "No document information available.";
    countryLanguageElement.textContent = country.details?.language?.content || "No language information available.";
    countryCurrencyElement.textContent = country.details?.language?.content2 || "No currency information available.";
    countryCustomsElement.textContent = country.details?.customs?.content || "No customs information available.";
    countryHealthElement.textContent = country.details?.health?.content || "No health information available.";
    countrySourcesElement.textContent = country.details?.sources?.content || "No sources available.";

    // Update emergency information
    updateEmergencyInfo(country.details?.emergency);
  }

  function updateEmergencyInfo(emergency) {
    // Emergency Numbers
    emergencyNumbersList.innerHTML = "";
    const numbers = emergency?.emergencyNumbers || [];
    numbers.forEach((item) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${item.service}:</strong> ${item.numbers.join(", ")}`;
      emergencyNumbersList.appendChild(li);
    });

    // Hospitals
    hospitalsList.innerHTML = "";
    const hospitals = emergency?.hospitals || [];
    hospitals.forEach((hospital) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${hospital.name}</strong> (${hospital.location})<br>${hospital.description}`;
      hospitalsList.appendChild(li);
    });

    // Embassies & Institutions
    embassiesList.innerHTML = "";
    const embassies = emergency?.embassiesAndInstitutions || [];
    embassies.forEach((institution) => {
      const li = document.createElement("li");
      let html = `<strong>${institution.name}</strong> (${institution.type})<br>`;
      if (institution.address) html += `Address: ${institution.address}<br>`;
      if (institution.phone) html += `Phone: ${institution.phone.join(", ")}`;
      li.innerHTML = html;
      embassiesList.appendChild(li);
    });
  }

  function centerSlide(countryIndex) {
    // Find all slides with the matching country index
    const matchingSlides = [];
    allSlides.forEach((slide, index) => {
      if (parseInt(slide.dataset.originalIndex) === countryIndex) {
        matchingSlides.push(index);
      }
    });

    if (matchingSlides.length === 0) return;

    // Find the slide index that requires the shortest distance from current position
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

    // Handle infinite scroll reset if needed
    const totalSlides = allSlides.length;
    const clonesAtStart = 2;
    const clonesAtEnd = 2;

    // If we're in the clone area at the end, reset to beginning
    if (currentIndex >= totalSlides - clonesAtEnd) {
      setTimeout(() => {
        currentIndex = clonesAtStart + (currentIndex - (totalSlides - clonesAtEnd));
        updateCarousel(false);
      }, 500);
    }
    // If we're in the clone area at the start, reset to end
    else if (currentIndex < clonesAtStart) {
      setTimeout(() => {
        currentIndex = totalSlides - clonesAtEnd - 1 - (clonesAtStart - 1 - currentIndex);
        updateCarousel(false);
      }, 500);
    }
  }

  function nextSlide() {
    currentIndex++;
    updateCarousel();

    // Check if we need to reset position (infinite scroll)
    if (currentIndex >= allSlides.length - 2) {
      setTimeout(() => {
        currentIndex = 2; // Jump back to start of real slides
        updateCarousel(false);
      }, 500);
    }

    // Update selected country
    const activeSlide = allSlides[currentIndex];
    const countryIndex = parseInt(activeSlide.dataset.originalIndex);
    selectCountry(countryIndex);
  }

  function prevSlide() {
    currentIndex--;
    updateCarousel();

    // Check if we need to reset position (infinite scroll)
    if (currentIndex < 2) {
      setTimeout(() => {
        currentIndex = allSlides.length - 3; // Jump to end of real slides
        updateCarousel(false);
      }, 500);
    }

    // Update selected country
    const activeSlide = allSlides[currentIndex];
    const countryIndex = parseInt(activeSlide.dataset.originalIndex);
    selectCountry(countryIndex);
  }

  // Event listeners
  nextButton?.addEventListener("click", nextSlide);
  prevButton?.addEventListener("click", prevSlide);

  // Handle window resize
  window.addEventListener("resize", () => {
    updateCarousel(false);
  });
});
