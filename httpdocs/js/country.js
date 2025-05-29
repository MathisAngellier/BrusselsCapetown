document.addEventListener("DOMContentLoaded", function () {
  const trackContainer = document.querySelector(".carousel-track-container");
  const track = document.getElementById("countries-select-carousel");
  const slides = Array.from(track.getElementsByClassName("carousel-slide"));
  const nextButton = document.querySelector(".button-next");
  const prevButton = document.querySelector(".button-prev");

  // Selected country section elements
  const countryNameElement = document.getElementById("country-name");
  const countryOverviewElement = document.getElementById("country-overview");
  const countryClimateElement = document.getElementById("country-climate");
  const countryDocumentsElement = document.getElementById("country-documents");
  const countryLanguageElement = document.getElementById("country-language-currency");
  const countryCustomsElement = document.getElementById("country-customs");
  const countryVaccinationsElement = document.getElementById("country-vaccinations");
  const countrySourcesElement = document.getElementById("country-sources");
  const emergencyNumbersList = document.querySelector(".emergency-numbers");
  const hospitalsList = document.querySelector(".hospitals");
  const embassiesList = document.querySelector(".embassies");

  let currentIndex = 0;
  let selectedCountryIndex = 0; // Belgium is default (index 0)
  let allSlides = []; // Will include original + cloned slides
  const countries = []; // Country data array

  // Fetch country data and initialize everything
  fetch("../data/countries_en.json")
    .then((response) => response.json())
    .then((data) => {
      // Handle both array format and object format
      const countryData = Array.isArray(data) ? data : data.countries || [];
      countries.push(...countryData);

      // Initialize the carousel with the fetched country data
      initializeCarousel();
    })
    .catch((error) => {
      console.error("Error fetching country data:", error);
      // Initialize with empty data to prevent crashes
      initializeCarousel();
    });

  // Initialize carousel function
  function initializeCarousel() {
    if (countries.length === 0) {
      console.warn("No country data available");
      return;
    }

    // Clone slides for infinite scrolling
    const totalClones = countries.length * 2;
    for (let i = 0; i < totalClones; i++) {
      const clone = slides[i % slides.length].cloneNode(true);
      track.appendChild(clone);
    }

    // Update allSlides array to include clones
    allSlides = Array.from(track.getElementsByClassName("carousel-slide"));

    // Add click event listeners to all slides
    addClickListeners();

    // Set initial position to center Belgium (first country)
    currentIndex = countries.length - 2;
    updateCarousel();
    selectCountry(0); // Select Belgium/first country as default
  }

  // Add click event listeners to all slides (including clones)
  function addClickListeners() {
    allSlides.forEach((slide, index) => {
      slide.addEventListener("click", function (e) {
        e.preventDefault();

        // Calculate the original country index
        const countryIndex = index % countries.length;
        selectCountry(countryIndex);

        // Center the clicked slide
        centerSlide(index);
      });
    });
  }

  // Function to select and display country information
  function selectCountry(countryIndex) {
    if (!countries[countryIndex]) return;

    selectedCountryIndex = countryIndex;
    const country = countries[countryIndex];

    // Update selected country display
    if (countryNameElement) countryNameElement.textContent = country.name || "";

    // Handle different data structures
    if (country.details) {
      // Detailed structure
      if (countryOverviewElement) countryOverviewElement.textContent = country.details.overview || "";
      if (countryClimateElement) countryClimateElement.textContent = country.details.climate?.content || "";
      if (countryDocumentsElement) countryDocumentsElement.textContent = country.details.documents?.content || "";
      if (countryLanguageElement) countryLanguageElement.textContent = country.details.language?.content || "";
      if (countryCustomsElement) countryCustomsElement.textContent = country.details.customs?.content || "";
      if (countryVaccinationsElement) countryVaccinationsElement.textContent = country.details.health?.content || "";
      if (countrySourcesElement) countrySourcesElement.textContent = country.details.sources?.content || "";

      // Handle emergency information
      populateEmergencyInfo(country.details.emergency);
    } else {
      // Simple structure (fallback)
      if (countryOverviewElement) countryOverviewElement.textContent = country.description || "";
      // Clear other fields if no detailed data
      clearDetailedFields();
    }

    // Stop all videos first
    stopAllVideos();

    // Play the selected country's video
    playCountryVideo(countryIndex);

    // Add visual selection indicator
    updateVisualSelection(countryIndex);
  }

  // Function to populate emergency information
  function populateEmergencyInfo(emergencyData) {
    if (!emergencyData) {
      clearEmergencyInfo();
      return;
    }

    // Clear existing content
    if (emergencyNumbersList) emergencyNumbersList.innerHTML = "";
    if (hospitalsList) hospitalsList.innerHTML = "";
    if (embassiesList) embassiesList.innerHTML = "";

    // Populate emergency numbers
    if (emergencyData.emergencyNumbers && emergencyNumbersList) {
      emergencyData.emergencyNumbers.forEach((item) => {
        const li = document.createElement("li");
        li.innerHTML = `<strong>${item.service}:</strong> ${item.numbers.join(", ")}`;
        emergencyNumbersList.appendChild(li);
      });
    }

    // Populate hospitals
    if (emergencyData.hospitals && hospitalsList) {
      emergencyData.hospitals.forEach((hospital) => {
        const li = document.createElement("li");
        li.innerHTML = `<strong>${hospital.name}</strong> (${hospital.location})<br>${hospital.description}`;
        hospitalsList.appendChild(li);
      });
    }

    // Populate embassies
    if (emergencyData.embassiesAndInstitutions && embassiesList) {
      emergencyData.embassiesAndInstitutions.forEach((institution) => {
        const li = document.createElement("li");
        let content = `<strong>${institution.name}</strong> (${institution.type})<br>`;

        if (institution.address) content += `Address: ${institution.address}<br>`;
        if (institution.addresses) content += `Addresses: ${institution.addresses.join(", ")}<br>`;
        if (institution.phone) content += `Phone: ${institution.phone.join(", ")}<br>`;
        if (institution.phones) content += `Phones: ${institution.phones.join(", ")}<br>`;
        if (institution.emails) content += `Emails: ${institution.emails.join(", ")}`;

        li.innerHTML = content;
        embassiesList.appendChild(li);
      });
    }
  }

  // Function to clear detailed fields
  function clearDetailedFields() {
    if (countryClimateElement) countryClimateElement.textContent = "";
    if (countryDocumentsElement) countryDocumentsElement.textContent = "";
    if (countryLanguageElement) countryLanguageElement.textContent = "";
    if (countryCustomsElement) countryCustomsElement.textContent = "";
    if (countryVaccinationsElement) countryVaccinationsElement.textContent = "";
    if (countrySourcesElement) countrySourcesElement.textContent = "";
    clearEmergencyInfo();
  }

  // Function to clear emergency information
  function clearEmergencyInfo() {
    if (emergencyNumbersList) emergencyNumbersList.innerHTML = "";
    if (hospitalsList) hospitalsList.innerHTML = "";
    if (embassiesList) embassiesList.innerHTML = "";
  }

  // Function to add visual selection indicators
  function updateVisualSelection(countryIndex) {
    // Remove previous selection styling
    allSlides.forEach((slide) => {
      slide.classList.remove("selected");
      const video = slide.querySelector(".flagVideo");
      if (video) {
        video.style.border = "";
        video.style.transform = "";
        video.style.boxShadow = "";
        video.style.width = "";
        video.style.height = "";
        video.style.zIndex = "";
      }
    });

    // Add selection styling to all instances of the selected country
    allSlides.forEach((slide, index) => {
      if (index % countries.length === countryIndex) {
        slide.classList.add("selected");
        const video = slide.querySelector(".flagVideo");
        if (video) {
          video.style.transform = "scale(1.05)";
          video.style.boxShadow = "0 6px 20px rgba(63, 65, 68, 0.4)";
          video.style.transition = "all 0.3s ease";
          video.style.width = "180px";
          video.style.height = "100px";
          video.style.zIndex = "10";
          video.style.position = "relative";
        }
      }
    });
  }

  // Function to get the middle country index based on current carousel position
  function getMiddleCountryIndex() {
    if (countries.length === 0) return 0;
    const middleSlideIndex = currentIndex + 2;
    return middleSlideIndex % countries.length;
  }

  // Function to stop all videos
  function stopAllVideos() {
    const allVideos = document.querySelectorAll(".flagVideo");
    allVideos.forEach((video) => {
      video.pause();
      video.currentTime = 0;
    });
  }

  // Function to play specific country video
  function playCountryVideo(countryIndex) {
    if (countries.length === 0) return;

    // Find all slides with this country (original + clones)
    const targetVideos = [];
    allSlides.forEach((slide, index) => {
      if (index % countries.length === countryIndex) {
        const video = slide.querySelector(".flagVideo");
        if (video) {
          targetVideos.push(video);
        }
      }
    });

    // Play all instances of this country's video
    targetVideos.forEach((video) => {
      video.play().catch((e) => console.log("Video play failed:", e));
    });
  }

  // Function to center a specific slide
  function centerSlide(slideIndex) {
    if (countries.length === 0) return;

    const slideWidth = getSlideWidth();
    const centerPosition = slideIndex - 2;

    currentIndex = centerPosition;
    track.style.transition = "transform 0.5s ease";
    track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;

    // Handle wrap-around for infinite scrolling
    setTimeout(() => {
      const totalSlides = allSlides.length;
      if (currentIndex >= totalSlides - 5) {
        track.style.transition = "none";
        currentIndex = countries.length + (currentIndex % countries.length);
        track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;
        setTimeout(() => {
          track.style.transition = "transform 0.5s ease";
        }, 50);
      } else if (currentIndex < 0) {
        track.style.transition = "none";
        currentIndex = countries.length + currentIndex;
        track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;
        setTimeout(() => {
          track.style.transition = "transform 0.5s ease";
        }, 50);
      }
    }, 500);
  }

  // Calculate slide width based on container width
  function getSlideWidth() {
    const containerWidth = trackContainer.getBoundingClientRect().width;
    return containerWidth / 5; // 5 slides visible at a time
  }

  // Set initial position
  function updateCarousel() {
    if (countries.length === 0) return;

    const slideWidth = getSlideWidth();
    track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;
  }

  // Next slide function
  function nextSlide() {
    if (countries.length === 0) return;

    const slideWidth = getSlideWidth();
    currentIndex++;
    track.style.transition = "transform 0.5s ease";
    track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;

    // Select the middle country after the transition
    setTimeout(() => {
      const middleCountryIndex = getMiddleCountryIndex();
      selectCountry(middleCountryIndex);
    }, 250);

    // Handle infinite scroll reset
    const totalSlides = allSlides.length;
    if (currentIndex >= totalSlides - 5) {
      setTimeout(() => {
        track.style.transition = "none";
        currentIndex = countries.length + (currentIndex % countries.length);
        track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;
        setTimeout(() => {
          const middleCountryIndex = getMiddleCountryIndex();
          selectCountry(middleCountryIndex);
        }, 50);
      }, 500);
    }
  }

  // Previous slide function
  function prevSlide() {
    if (countries.length === 0) return;

    const slideWidth = getSlideWidth();
    currentIndex--;
    track.style.transition = "transform 0.5s ease";
    track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;

    // Select the middle country after the transition
    setTimeout(() => {
      const middleCountryIndex = getMiddleCountryIndex();
      selectCountry(middleCountryIndex);
    }, 250);

    // Handle infinite scroll reset
    if (currentIndex < 0) {
      setTimeout(() => {
        track.style.transition = "none";
        currentIndex = countries.length + currentIndex;
        track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;
        setTimeout(() => {
          const middleCountryIndex = getMiddleCountryIndex();
          selectCountry(middleCountryIndex);
        }, 50);
      }, 500);
    }
  }

  // Event listeners for navigation buttons
  if (nextButton) {
    nextButton.addEventListener("click", () => {
      nextSlide();
    });
  }

  if (prevButton) {
    prevButton.addEventListener("click", () => {
      prevSlide();
    });
  }

  // Handle window resize
  window.addEventListener("resize", () => {
    if (countries.length === 0) return;

    // Stop transition during resize
    track.style.transition = "none";
    updateCarousel();
    // Resume transition after a short delay
    setTimeout(() => {
      track.style.transition = "transform 0.5s ease";
    }, 50);
  });
});
