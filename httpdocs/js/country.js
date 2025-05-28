document.addEventListener("DOMContentLoaded", function () {
  const trackContainer = document.querySelector(".carousel-track-container");
  const track = document.getElementById("countries-select-carousel");
  const slides = Array.from(track.getElementsByClassName("carousel-slide"));
  const nextButton = document.querySelector(".button-next");
  const prevButton = document.querySelector(".button-prev");

  // Selected country section elements
  const countryNameElement = document.getElementById("country-name");
  const countryDescriptionElement = document.getElementById("country-description");

  let currentIndex = 0;
  let selectedCountryIndex = 0; // Belgium is default (index 0)
  let slideInterval;
  let allSlides = []; // Will include original + cloned slides

  // Country data
  const countries = [
    {
      name: "Belgium",
      video: "../video/Flags/Belgium.mp4",
      description:
        "Belgium is the starting point of this incredible journey. Known for its medieval towns, Renaissance architecture, and as headquarters of the European Union and NATO. Famous for chocolate, waffles, and beer.",
    },
    {
      name: "France",
      video: "../video/Flags/France.mp4",
      description:
        "France offers diverse landscapes from the Mediterranean coast to the Pyrenees mountains. Rich in culture, cuisine, and history, it's a cyclist's paradise with varied terrain and excellent infrastructure.",
    },
    {
      name: "Spain",
      video: "../video/Flags/Spain.mp4",
      description:
        "Spain provides warm hospitality and stunning coastlines. From the Camino de Santiago to Andalusian villages, Spain offers rich cultural experiences and delicious cuisine for the traveling cyclist.",
    },
    {
      name: "Morocco",
      video: "../video/Flags/Morocco.mp4",
      description:
        "Morocco marks the entrance into Africa. A land of contrasts with bustling souks, Atlas Mountains, and the Sahara Desert. Experience Berber culture, mint tea, and incredible landscapes.",
    },
    {
      name: "Western Sahara",
      video: "../video/Flags/Western Sahara.mp4",
      description:
        "Western Sahara presents vast desert landscapes and unique challenges. This territory offers solitude and stark beauty as the journey continues deeper into Africa.",
    },
    {
      name: "Mauritania",
      video: "../video/Flags/Mauritania.mp4",
      description:
        "Mauritania bridges Arab and sub-Saharan Africa. Experience nomadic culture, ancient trading cities, and the transition from desert to savanna landscapes.",
    },
    {
      name: "Senegal",
      video: "../video/Flags/Senegal.mp4",
      description:
        "Senegal welcomes with vibrant culture, music, and friendly people. Dakar's energy and the country's rich history make it a memorable stop on the African continent.",
    },
    {
      name: "Guinea",
      video: "../video/Flags/Guinea.mp4",
      description:
        "Guinea features lush highlands and diverse ecosystems. Known as the 'Water Tower of West Africa', it offers beautiful landscapes and rich mineral resources.",
    },
    {
      name: "Sierra Leone",
      video: "../video/Flags/Sierra Leone.mp4",
      description:
        "Sierra Leone boasts beautiful beaches and resilient people. Despite past challenges, the country offers incredible natural beauty and warm hospitality.",
    },
    {
      name: "Liberia",
      video: "../video/Flags/Liberia.mp4",
      description:
        "Liberia, Africa's oldest republic, offers dense rainforests and unique history. Founded by freed American slaves, it provides fascinating cultural perspectives.",
    },
    {
      name: "Ivory Coast",
      video: "../video/Flags/Ivory Coast.mp4",
      description:
        "Ivory Coast (Côte d'Ivoire) is known for cocoa production and diverse landscapes. From coastal lagoons to northern savannas, it offers varied cycling experiences.",
    },
    {
      name: "Ghana",
      video: "../video/Flags/Ghana.mp4",
      description:
        "Ghana, the 'Gateway to Africa', offers rich history and stable democracy. Visit ancient castles, vibrant markets, and experience the warmth of Ghanaian hospitality.",
    },
    {
      name: "Togo",
      video: "../video/Flags/Togo.mp4",
      description:
        "Togo is a narrow country with diverse geography from coast to mountains. Experience voodoo culture, German colonial architecture, and friendly local communities.",
    },
    {
      name: "Namibia",
      video: "../video/Flags/Namibia.mp4",
      description:
        "Namibia offers some of the world's most spectacular desert landscapes. From the Namib Desert to Etosha National Park, it's a photographer's and adventurer's dream.",
    },
    {
      name: "South Africa",
      video: "../video/Flags/South Africa.mp4",
      description:
        "South Africa is the final destination - Cape Town! Experience diverse cultures, stunning landscapes, and the accomplishment of completing this epic journey across Africa.",
    },
  ];

  // Clone slides for infinite scrolling - add more clones for better infinite effect
  // We need enough clones to handle the positioning
  const totalClones = countries.length * 2; // Double the original set
  for (let i = 0; i < totalClones; i++) {
    const clone = slides[i % slides.length].cloneNode(true);
    track.appendChild(clone);
  }

  // Update allSlides array to include clones
  allSlides = Array.from(track.getElementsByClassName("carousel-slide"));

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

        // Restart auto-scroll after interaction
      });
    });
  }

  // Function to select and display country information
  function selectCountry(countryIndex) {
    selectedCountryIndex = countryIndex;
    const country = countries[countryIndex];

    // Update selected country display
    countryNameElement.textContent = country.name;
    countryDescriptionElement.textContent = country.description;

    // Stop all videos first
    stopAllVideos();

    // Play the selected country's video
    playCountryVideo(countryIndex);

    // Add visual selection indicator
    updateVisualSelection(countryIndex);
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
    // Middle slide is at position currentIndex + 2 (since we show 5 slides, middle is the 3rd one)
    const middleSlideIndex = currentIndex + 2;
    // Convert to country index (handle wrap-around)
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
    const slideWidth = getSlideWidth();
    // Calculate position to center the slide (show 2 slides on each side)
    const centerPosition = slideIndex - 2;

    currentIndex = centerPosition;
    track.style.transition = "transform 0.5s ease";
    track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;

    // Handle wrap-around for infinite scrolling
    setTimeout(() => {
      const totalSlides = allSlides.length;
      if (currentIndex >= totalSlides - 5) {
        // Near the end
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
    const slideWidth = getSlideWidth();
    track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;
  }

  // Next slide function - UPDATED to auto-select middle country
  function nextSlide() {
    const slideWidth = getSlideWidth();
    currentIndex++;
    track.style.transition = "transform 0.5s ease";
    track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;

    // Select the middle country after the transition
    setTimeout(() => {
      const middleCountryIndex = getMiddleCountryIndex();
      selectCountry(middleCountryIndex);
    }, 250); // Half of transition time for smoother experience

    // Handle infinite scroll reset
    const totalSlides = allSlides.length;
    if (currentIndex >= totalSlides - 5) {
      // Near the end
      setTimeout(() => {
        track.style.transition = "none";
        currentIndex = countries.length + (currentIndex % countries.length);
        track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;
        // Update selection after reset
        setTimeout(() => {
          const middleCountryIndex = getMiddleCountryIndex();
          selectCountry(middleCountryIndex);
        }, 50);
      }, 500);
    }
  }

  // Previous slide function - UPDATED to auto-select middle country
  function prevSlide() {
    const slideWidth = getSlideWidth();
    currentIndex--;
    track.style.transition = "transform 0.5s ease";
    track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;

    // Select the middle country after the transition
    setTimeout(() => {
      const middleCountryIndex = getMiddleCountryIndex();
      selectCountry(middleCountryIndex);
    }, 250); // Half of transition time for smoother experience

    // Handle infinite scroll reset
    if (currentIndex < 0) {
      setTimeout(() => {
        track.style.transition = "none";
        currentIndex = countries.length + currentIndex;
        track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;
        // Update selection after reset
        setTimeout(() => {
          const middleCountryIndex = getMiddleCountryIndex();
          selectCountry(middleCountryIndex);
        }, 50);
      }, 500);
    }
  }

  // Event listeners for navigation buttons
  nextButton.addEventListener("click", () => {
    nextSlide();
  });

  prevButton.addEventListener("click", () => {
    prevSlide();
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

  // Initialize everything
  addClickListeners();

  // Set initial position to center Belgium with South Africa and Namibia on the left, France and Spain on the right
  // With our cloning setup, Belgium appears at indices: 0, 15, 30, etc.
  // We want Belgium (index 15 from the first clone set) in the center
  // This will show: South Africa(14), Namibia(13), Belgium(15), France(16), Spain(17)
  currentIndex = countries.length - 2; // This positions Belgium in the center
  updateCarousel();
  selectCountry(0); // Select Belgium as default
});
