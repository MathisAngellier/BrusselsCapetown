// Make ScrollTrigger available for use in GSAP animations
gsap.registerPlugin(ScrollTrigger);

// Select the HTML elements needed for the animation
const scrollSection = document.querySelectorAll(".scroll-section");

function initializeAnimations() {
  // Kill all existing ScrollTrigger instances
  ScrollTrigger.getAll().forEach((trigger) => trigger.kill());

  scrollSection.forEach((section) => {
    const wrapper = section.querySelector(".wrapper");
    const items = wrapper.querySelectorAll(".item");

    // Initialize
    let direction = null;
    if (section.classList.contains("vertical-section")) {
      direction = "vertical";
    } else if (section.classList.contains("horizontal-section")) {
      // Dynamic direction based on screen size
      direction = window.innerWidth <= 768 ? "vertical" : "horizontal";
    }

    initScroll(section, items, direction);
  });
}

function initScroll(section, items, direction) {
  // Clear any existing transforms
  items.forEach((item) => {
    gsap.set(item, { clearProps: "all" });
  });

  // Initial states
  items.forEach((item, index) => {
    if (index !== 0) {
      direction == "horizontal" ? gsap.set(item, { xPercent: 100 }) : gsap.set(item, { yPercent: 100 });
    }
  });

  const timeline = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      pin: true,
      start: "top top",
      end: () => `+=${items.length * 100}%`,
      scrub: 1,
      invalidateOnRefresh: true,
    },
    defaults: { ease: "none" },
  });

  items.forEach((item, index) => {
    timeline.to(item, {
      scale: 0.9,
      borderRadius: "10px",
    });

    if (items[index + 1]) {
      direction == "horizontal" ? timeline.to(items[index + 1], { xPercent: 0 }, "<") : timeline.to(items[index + 1], { yPercent: 0 }, "<");
    }
  });
}

// Initialize on load
document.addEventListener("DOMContentLoaded", () => {
  initializeAnimations();
});

// Refresh ScrollTrigger on window resize with debouncing
let resizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    initializeAnimations();
  }, 250);
});
