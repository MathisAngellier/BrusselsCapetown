document.addEventListener("DOMContentLoaded", function () {
  // === Hero Background Image Carousel ===
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
    setTimeout(() => {
      fadingLayer.classList.add("active");
    }, 50);
    setTimeout(() => {
      heroOverlay.style.backgroundImage = `url('${images[nextIndex]}')`;
      heroOverlay.removeChild(fadingLayer);
      currIndex = nextIndex;
      nextIndex = (nextIndex + 1) % images.length;
    }, 1600);
  }
  setInterval(changeBackground, 3500);

  // === Sponsor Carousel ===
  const trackContainer = document.querySelector(".carousel-track-container");
  const track = document.getElementById("sponsor-carousel");
  const slides = Array.from(track.getElementsByClassName("carousel-slide"));
  const nextButton = document.querySelector(".button-next");
  const prevButton = document.querySelector(".button-prev");
  let currentIndex = 0;
  let slideInterval;

  // Clone slides for seamless looping
  for (let i = 0; i < (window.innerWidth <= 767 ? 2 : 6); i++) {
    const clone = slides[i % slides.length].cloneNode(true);
    track.appendChild(clone);
  }

  function getSlideWidth() {
    const containerWidth = trackContainer.getBoundingClientRect().width;
    return window.innerWidth <= 767 ? containerWidth / 2 : containerWidth / 6;
  }

  function updateCarousel() {
    const slideWidth = getSlideWidth();
    track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;
  }

  function nextSlide() {
    const slideWidth = getSlideWidth();
    currentIndex++;
    track.style.transition = "transform 0.5s ease";
    track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;
    if (currentIndex >= slides.length) {
      setTimeout(() => {
        track.style.transition = "none";
        currentIndex = 0;
        track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;
      }, 500);
    }
  }

  function prevSlide() {
    const slideWidth = getSlideWidth();
    currentIndex--;
    track.style.transition = "transform 0.5s ease";
    track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;
    if (currentIndex < 0) {
      setTimeout(() => {
        track.style.transition = "none";
        currentIndex = slides.length - 1;
        track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;
      }, 500);
    }
  }

  function startAutoScroll() {
    slideInterval = setInterval(nextSlide, 3000);
  }

  function stopAutoScroll() {
    clearInterval(slideInterval);
  }

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

  window.addEventListener("resize", () => {
    track.style.transition = "none";
    updateCarousel();
    setTimeout(() => {
      track.style.transition = "transform 0.5s ease";
    }, 50);
  });

  updateCarousel();
  startAutoScroll();
  track.addEventListener("mouseenter", stopAutoScroll);
  track.addEventListener("mouseleave", startAutoScroll);

  // === Hamburger Menu (Mobile) ===
  const hamburger = document.querySelector(".hamburger");
  const navLinks = document.querySelector(".nav-links");
  if (hamburger && navLinks) {
    hamburger.addEventListener("click", () => {
      navLinks.classList.toggle("show");
    });
    document.querySelectorAll(".nav-links a").forEach((link) =>
      link.addEventListener("click", () => {
        navLinks.classList.remove("show");
      })
    );
  }

  // Move "COUNTRIES" out of the dropdown for mobile
  function updateMobileMenu() {
    if (window.innerWidth <= 767) {
      const countriesLink = document.querySelector(".dropdown-content a.sub-menu");
      const routeLink = document.querySelector(".dropdown a.dropbtn");
      const dropdown = document.querySelector(".dropdown");
      if (countriesLink && routeLink && dropdown) {
        routeLink.insertAdjacentElement("afterend", countriesLink);
        dropdown.removeChild(document.querySelector(".dropdown-content"));
      }
    }
  }

  // Run on load and resize
  window.addEventListener("load", updateMobileMenu);
  window.addEventListener("resize", updateMobileMenu);

  // === Initial Scroll Animations ===
  handleScrollAnimations();
});

// === Logo Update ===
function updateLogo() {
  const logoImg = document.getElementById("logo-img");
  if (!logoImg) return;
  const pathPrefix = window.location.pathname.includes("/views/") ? "../" : "";
  const mobileSrc = `${pathPrefix}img/Logo-petit-format.png`;
  const desktopSrc = `${pathPrefix}img/Logo-petit-format+vélo.jpg`;
  if (window.innerWidth <= 767) {
    logoImg.src = mobileSrc;
  } else {
    logoImg.src = desktopSrc;
  }
}

// Call on load and resize
window.addEventListener("load", updateLogo);
window.addEventListener("resize", updateLogo);

// === Scroll-Triggered Animations ===
function handleScrollAnimations() {
  const animatedElements = document.querySelectorAll(".scroll-animation, .fade-in-animation, .slide-in-left, .slide-in-right");
  animatedElements.forEach((el) => {
    const rect = el.getBoundingClientRect();
    const isVisible = rect.top < window.innerHeight - 100;
    if (isVisible && !el.classList.contains("animate-active")) {
      el.classList.add("animate-active");
    }
  });
}

window.addEventListener("scroll", handleScrollAnimations);
window.addEventListener("resize", handleScrollAnimations);

// === Video Popup Logic ===
function closePopup() {
  document.getElementById("videoPopup").style.display = "none";
  document.body.style.overflow = "auto";
  handleScrollAnimations();
}

window.onload = function () {
  document.getElementById("videoPopup").style.display = "flex";
  document.body.style.overflow = "hidden";
  setTimeout(() => {
    closePopup();
  }, 8000);
};
