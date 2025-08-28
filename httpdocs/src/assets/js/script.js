document.addEventListener("DOMContentLoaded", function () {
  const heroOverlay = document.querySelector(".hero-overlay");
  if (heroOverlay) {
    const images = [
      "/img/DJI_0517-min-scaled.jpg",
      "/img/DJI_0558-min-scaled.jpg",
      "/img/IMG_20180128_103822.jpg",
      "/img/Namibie3.jpg",
      "/img/IMG_20221109_152708.jpg",
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
  }

  const trackContainer = document.querySelector(".carousel-track-container");
  const track = document.getElementById("sponsor-carousel");
  if (trackContainer && track) {
    const slides = Array.from(track.getElementsByClassName("carousel-slide"));
    const nextButton = document.querySelector(".button-next");
    const prevButton = document.querySelector(".button-prev");
    let currentIndex = 0;
    let slideInterval;

    const cloneCount = window.innerWidth <= 767 ? 2 : 6;
    for (let i = 0; i < cloneCount; i++) {
      const clone = slides[i % slides.length].cloneNode(true);
      track.appendChild(clone);
    }

    function getSlideWidth() {
      const containerWidth = trackContainer.getBoundingClientRect().width;
      if (window.innerWidth <= 767) {
        return containerWidth * 0.6;
      }
      return containerWidth / 6;
    }

    function updateCenterSlide() {
      if (window.innerWidth <= 767) {
        const allSlides = track.querySelectorAll(".carousel-slide");
        allSlides.forEach((slide, index) => {
          slide.classList.remove("center-slide");
          if (index === currentIndex) {
            slide.classList.add("center-slide");
          }
        });
      }
    }

    function updateCarousel() {
      const slideWidth = getSlideWidth();
      if (window.innerWidth <= 767) {
        const offset = trackContainer.getBoundingClientRect().width * 0.2;
        track.style.transform = `translateX(${offset - currentIndex * slideWidth}px)`;
      } else {
        track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;
      }
      updateCenterSlide();
    }

    function nextSlide() {
      const slideWidth = getSlideWidth();
      currentIndex++;
      track.style.transition = "transform 0.5s ease";

      if (window.innerWidth <= 767) {
        const offset = trackContainer.getBoundingClientRect().width * 0.2;
        track.style.transform = `translateX(${offset - currentIndex * slideWidth}px)`;
      } else {
        track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;
      }

      if (currentIndex >= slides.length) {
        setTimeout(() => {
          track.style.transition = "none";
          currentIndex = 0;
          updateCarousel();
        }, 500);
      }
      updateCenterSlide();
    }

    function prevSlide() {
      const slideWidth = getSlideWidth();
      currentIndex--;
      track.style.transition = "transform 0.5s ease";

      if (currentIndex < 0) {
        setTimeout(() => {
          track.style.transition = "none";
          currentIndex = slides.length - 1;
          updateCarousel();
        }, 500);
      } else {
        if (window.innerWidth <= 767) {
          const offset = trackContainer.getBoundingClientRect().width * 0.2;
          track.style.transform = `translateX(${offset - currentIndex * slideWidth}px)`;
        } else {
          track.style.transform = `translateX(${-currentIndex * slideWidth}px)`;
        }
      }
      updateCenterSlide();
    }

    function startAutoScroll() {
      slideInterval = setInterval(nextSlide, 3000);
    }

    function stopAutoScroll() {
      clearInterval(slideInterval);
    }

    if (nextButton && prevButton) {
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
    }

    window.addEventListener("resize", () => {
      track.style.transition = "none";
      updateCarousel();
      setTimeout(() => {
        track.style.transition = "transform 0.5s ease";
      }, 50);
    });

    updateCarousel();
    startAutoScroll();

    if (track) {
      track.addEventListener("mouseenter", stopAutoScroll);
      track.addEventListener("mouseleave", startAutoScroll);
    }
  }

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

  window.addEventListener("load", updateMobileMenu);
  window.addEventListener("resize", updateMobileMenu);

  handleScrollAnimations();
  window.closePopup = closePopup;
});

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

function setResponsiveVideoSource() {
  const video = document.getElementById("responsive-video");
  if (!video) return;
  const isMobile = window.innerWidth <= 768;
  const mobileSrc = video.dataset.videoMobile;
  const desktopSrc = video.dataset.videoDesktop;
  const selectedSrc = isMobile ? mobileSrc : desktopSrc;
  const absoluteSrc = new URL(selectedSrc, window.location.origin).href;
  if (video.src !== absoluteSrc) {
    video.src = selectedSrc;
    video.load();
    video.play().catch(() => {});
  }
}

window.addEventListener("DOMContentLoaded", setResponsiveVideoSource);
window.addEventListener("resize", setResponsiveVideoSource);
window.addEventListener("load", updateLogo);
window.addEventListener("resize", updateLogo);

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

function closePopup() {
  const popup = document.getElementById("videoPopup");
  if (popup) {
    popup.style.display = "none";
    document.body.style.overflow = "auto";
    handleScrollAnimations();
  }
}

window.onload = function () {
  const popup = document.getElementById("videoPopup");
  if (popup) {
    popup.style.display = "flex";
    document.body.style.overflow = "hidden";
    setTimeout(() => {
      closePopup();
    }, 9000);
  }
};
