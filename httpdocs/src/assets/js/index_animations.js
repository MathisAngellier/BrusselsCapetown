document.addEventListener("DOMContentLoaded", function () {
  const journeyStats = document.querySelector(".journey-stats");
  const statCards = document.querySelectorAll(".stat-card");
  const missionSection = document.querySelector(".mission-section");
  const missionText = document.querySelector(".mission-text");
  const missionImage = document.querySelector(".mission-image");
  const routeSection = document.querySelector(".route-section");
  const sponsorSection = document.querySelector(".sponsor-section");

  // Add animation-ready classes
  journeyStats.classList.add("scroll-animation");
  missionSection.classList.add("scroll-animation");
  routeSection.classList.add("scroll-animation");
  sponsorSection.classList.add("scroll-animation");

  statCards.forEach((card) => {
    card.classList.add("fade-in-animation");
  });

  missionText.classList.add("slide-in-left");
  // Change from slide-in-right to zoom-in
  missionImage.classList.add("zoom-in");

  // Intersection Observer for scroll animations
  const observerOptions = {
    root: null, // use viewport
    rootMargin: "0px",
    threshold: 0.2, // trigger when 20% of element is visible
  };

  const animateOnScroll = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        // Add active class to trigger animation
        entry.target.classList.add("animate-active");

        // For stat cards, add staggered animations
        if (entry.target === journeyStats) {
          statCards.forEach((card, index) => {
            setTimeout(() => {
              card.classList.add("animate-active");
            }, index * 150); // 150ms delay between each card
          });
        }

        // Unobserve after animation is triggered
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Observe all elements with scroll-animation class
  document.querySelectorAll(".scroll-animation").forEach((element) => {
    animateOnScroll.observe(element);
  });

  // Also observe mission text and image separately
  animateOnScroll.observe(missionText);
  animateOnScroll.observe(missionImage);
});
