document.addEventListener("DOMContentLoaded", function () {
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

  // Replace the sampleCountries array with:
  fetch("../data/countries_en.json")
    .then((response) => response.json())
    .then((data) => {
      countries = data.countries;
      generateSlides();
      selectCountry(0);
    })
    .catch((error) => {
      console.error("Error loading countries:", error);
    });

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
    updateCarousel(false);
  }

  function createSlide(country, originalIndex, isClone) {
    const slide = document.createElement("div");
    slide.className = "carousel-slide";
    slide.dataset.originalIndex = originalIndex;

    const video = document.createElement("video");
    video.className = "flagVideo";
    video.src = country.video;
    video.setAttribute("muted", "true");
    video.setAttribute("loop", "true");
    video.setAttribute("playsinline", "true");
    flagElement = video;

    slide.appendChild(flagElement);
    track.appendChild(slide);

    if (!isClone) {
      slide.addEventListener("click", () => {
        selectCountry(originalIndex);
        centerSlide(originalIndex);
      });
    }
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
        activeVideo.play().catch(() => {}); // Handle autoplay restrictions
      }
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
    // Find the slide with the matching country index that's not a clone
    const targetSlideIndex = allSlides.findIndex((slide, index) => {
      return parseInt(slide.dataset.originalIndex) === countryIndex && index >= 2 && index < allSlides.length - 2; // Avoid clones at start/end
    });

    if (targetSlideIndex !== -1) {
      currentIndex = targetSlideIndex;
      updateCarousel();
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
