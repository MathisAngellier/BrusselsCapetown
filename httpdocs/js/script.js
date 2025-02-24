document.addEventListener("DOMContentLoaded", function () {
  const dropdowns = document.querySelectorAll(".dropdown");

  // Handle keyboard navigation
  dropdowns.forEach((dropdown) => {
    const dropbtn = dropdown.querySelector(".dropbtn");
    const dropdownContent = dropdown.querySelector(".dropdown-content");
    const links = dropdownContent.querySelectorAll("a");
    dropbtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        dropdownContent.style.display = dropdownContent.style.display === "block" ? "none" : "block";
      }
    });
  });

  var swiper = new Swiper("#client-carousel", {
    loop: true,
    speed: 800,
    slidesPerView: "auto",
    preventInteractionOnTransition: true,
    autoplay: {
      delay: 3000,
      disableOnInteraction: false,
    },
    navigation: {
      nextEl: ".swiper-button-next",
      prevEl: ".swiper-button-prev",
    },
    pagination: {
      el: ".swiper-pagination",
      clickable: true,
    },
    breakpoints: {
      320: {
        slidesPerView: 2,
        spaceBetween: 20,
      },
      480: {
        slidesPerView: 3,
        spaceBetween: 20,
      },
      768: {
        slidesPerView: 4,
        spaceBetween: 20,
      },
      1024: {
        slidesPerView: 6,
        spaceBetween: 20,
      },
    },
  });

  const heroOverlay = document.querySelector(".hero-overlay");
  const images = [
    "img/DJI_0517-min-scaled 1.jpg",
    "img/DJI_0558-min-scaled 1.jpg",
    "img/IMG_20180128_103822 1.jpg",
    "img/Namibie.jpg",
    "img/IMG_20221109_152708 1.jpg",
  ];

  let currentIndex = 0;
  let nextIndex = 1;

  heroOverlay.style.backgroundImage = `url('${images[currentIndex]}')`;

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
      currentIndex = nextIndex;
      nextIndex = (nextIndex + 1) % images.length;
    }, 1600);
  }

  setInterval(changeBackground, 3500);
});
