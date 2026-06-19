document.addEventListener("DOMContentLoaded", function () {
  const journeyStats = document.querySelector(".journey-stats");
  const statCards = document.querySelectorAll(".stat-card");
  const missionSection = document.querySelector(".mission-section");
  const missionText = document.querySelector(".mission-text");
  const missionImage = document.querySelector(".mission-image");
  const routeSection = document.querySelector(".route-section");
  const sponsorSection = document.querySelector(".sponsor-section");

  [journeyStats, missionSection, routeSection, sponsorSection]
    .filter(Boolean)
    .forEach((element) => element.classList.add("scroll-animation"));

  statCards.forEach((card) => card.classList.add("fade-in-animation"));
  missionText?.classList.add("slide-in-left");
  missionImage?.classList.add("zoom-in");

  const observerOptions = {
    root: null,
    rootMargin: "0px",
    threshold: 0.2,
  };

  const animateOnScroll = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;

      entry.target.classList.add("animate-active");

      if (entry.target === journeyStats) {
        statCards.forEach((card, index) => {
          setTimeout(() => card.classList.add("animate-active"), index * 150);
        });
      }

      observer.unobserve(entry.target);
    });
  }, observerOptions);

  document
    .querySelectorAll(".scroll-animation, .slide-in-left, .zoom-in")
    .forEach((element) => animateOnScroll.observe(element));
});
