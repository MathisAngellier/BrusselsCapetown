document.addEventListener("DOMContentLoaded", async function () {
  await initializeLanguage();

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      switchLanguage(btn.dataset.lang);
      location.reload();
    });
  });

  const heroOverlay = document.querySelector(".hero-overlay");

  const images = [
    "img/DJI_0517-min-scaled 1.jpg",
    "img/DJI_0558-min-scaled 1.jpg",
    "img/IMG_20180128_103822 1.jpg",
    "img/Namibie3.jpg",
    "img/IMG_20221109_152708 1.jpg",
  ];

  let currIndex = 0;
  let nextIndex = 1;

  heroOverlay.style.backgroundImage = `url('${images[currIndex]}')`;

  function changeBackground() {
    const fadingLayer = document.createElement("div");
    fadingLayer.classList.add("fade-layer");
    fadingLayer.style.backgroundImage = `url('${images[nextIndex]}')`;
    heroOverlay.appendChild(fadingLayer);

    // Add the "active" class to trigger the fade-in effect
    setTimeout(() => {
      fadingLayer.classList.add("active");
    }, 50);

    // Remove old background after transition
    setTimeout(() => {
      heroOverlay.style.backgroundImage = `url('${images[nextIndex]}')`;
      heroOverlay.removeChild(fadingLayer);
      currIndex = nextIndex;
      nextIndex = (nextIndex + 1) % images.length;
    }, 1600);
  }

  setInterval(changeBackground, 3500);

  const trackContainer = document.querySelector(".carousel-track-container");
  const track = document.getElementById("sponsor-carousel");
  const slides = Array.from(track.getElementsByClassName("carousel-slide"));
  const nextButton = document.querySelector(".button-next");
  const prevButton = document.querySelector(".button-prev");
  let currentIndex = 0;
  let slideInterval;

  // Clone only enough slides for continuous scrolling
  // We need at least 6 more slides to maintain the illusion of infinite scrolling
  for (let i = 0; i < 6; i++) {
    const clone = slides[i % slides.length].cloneNode(true);
    track.appendChild(clone);
  }

  // Calculate slide width based on container width
  function getSlideWidth() {
    const containerWidth = trackContainer.getBoundingClientRect().width;
    return containerWidth / 6; // 6 slides visible at a time
  }

  // Set initial position
  function updateCarousel() {
    const slideWidth = getSlideWidth();
    track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;
  }

  // Next slide function
  function nextSlide() {
    const slideWidth = getSlideWidth();
    currentIndex++;
    track.style.transition = "transform 0.5s ease";
    track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;

    // If we've reached close to the end of original slides, reset to the beginning after transition
    if (currentIndex >= slides.length) {
      setTimeout(() => {
        track.style.transition = "none";
        currentIndex = 0;
        track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;
      }, 500);
    }
  }

  // Previous slide function
  function prevSlide() {
    const slideWidth = getSlideWidth();
    currentIndex--;
    track.style.transition = "transform 0.5s ease";
    track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;

    // If we're at the beginning, jump to the end
    if (currentIndex < 0) {
      setTimeout(() => {
        track.style.transition = "none";
        currentIndex = slides.length - 1;
        track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;
      }, 500);
    }
  }

  // Initialize auto-scroll
  function startAutoScroll() {
    slideInterval = setInterval(nextSlide, 3000);
  }

  // Stop auto-scroll on user interaction
  function stopAutoScroll() {
    clearInterval(slideInterval);
  }

  // Event listeners
  nextButton.addEventListener("click", () => {
    stopAutoScroll();
    nextSlide();
    startAutoScroll();
  });

  prevButton.addEventListener("click", () => {
    stopAutoScroll();
    prevSlide();
    startAutoScroll();
  });

  // Handle window resize
  window.addEventListener("resize", () => {
    // Stop transition during resize
    track.style.transition = "none";
    updateCarousel();

    // Resume transition after a short delay
    setTimeout(() => {
      track.style.transition = "transform 0.5s ease";
    }, 50);
  });

  // Initialize
  updateCarousel();
  startAutoScroll();

  // Pause autoplay when hovering
  track.addEventListener("mouseenter", stopAutoScroll);
  track.addEventListener("mouseleave", startAutoScroll);
});

function closePopup() {
  document.getElementById("videoPopup").style.display = "none";
}

// Optional: Show popup only once per session
window.onload = function () {
  document.getElementById("videoPopup").style.display = "flex";
};

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
