document.addEventListener("DOMContentLoaded", () => {
  const masicorpImages = [
    "0_Masiphumelele.jpg",
    "0_Portrait1.jpg",
    "0_Portrait2.jpg",
    "0_Portrait3.jpg",
    "0_Portrait4.jpg",
    "1_Children1.jpg",
    "1_Children2.jpg",
    "1_Children3.jpg",
    "1_Children4.jpg",
    "1_Children5.jpg",
    "2_Young1.jpg",
    "2_Young2.jpg",
    "2_Young3.jpg",
    "2_Young4.jpg",
    "2_Young5.jpg",
    "2_Young6.jpg",
    "2_Young7.jpg",
    "2_Young8.jpg",
    "3_Evangeline1.jpg",
    "3_Evangeline2.jpg",
    "3_Evangeline3.jpg",
    "3_Evangeline4.jpg",
    "3_Evangeline5.jpg",
    "3_Evangeline6.jpg",
    "3_Evangeline7.jpg",
    "4_Adult1.jpg",
    "4_Adult2.jpg",
  ];

  const songezoImages = [
    "5_Songezo1.jpg",
    "5_Songezo2.jpg",
    "5_Songezo3.jpg",
    "5_Songezo4.jpg",
    "5_Songezo5.jpg",
    "5_Songezo6.jpg",
    "5_Songezo7.jpg",
    "5_Songezo8.jpg",
    "5_Songezo9.jpg",
    "5_Songezo10.jpg",
    "5_Songezo11.jpg",
    "5_Songezo12.jpg",
    "5_Songezo13.jpg",
    "5_Songezo14.jpg",
    "5_Songezo15.jpg",
    "5_Songezo16.jpg",
    "5_Songezo17.jpg",
    "5_Songezo18.jpg",
    "5_Songezo19.jpg",
    "5_Songezo20.jpg",
    "5_Songezo21.jpg",
    "5_Songezo22.jpg",
    "5_Songezo23.jpg",
    "5_Songezo24.jpg",
    "5_Songezo25.jpg",
    "5_Songezo26.jpg",
    "5_Songezo27.jpg",
  ];

  const buildImagePath = (folder, filename) => `/img/${folder}/${filename}`;
  const _timers = [];

  function clearTimers() {
    while (_timers.length) {
      const id = _timers.shift();
      try {
        clearInterval(id);
      } catch (e) {}
      try {
        clearTimeout(id);
      } catch (e) {}
    }
  }

  function sampleImages(fileList, count = 8) {
    if (!Array.isArray(fileList) || fileList.length <= count) return fileList.slice();
    const sampled = [];
    const step = Math.floor(fileList.length / count) || 1;
    for (let i = 0; sampled.length < count && i < fileList.length; i += step) {
      sampled.push(fileList[i]);
    }
    let idx = 0;
    while (sampled.length < count && idx < fileList.length) {
      const v = fileList[idx];
      if (!sampled.includes(v)) sampled.push(v);
      idx++;
    }
    return sampled;
  }

  function setupCyclingImages(sectionSelector, folderName, fileList) {
    const images = document.querySelectorAll(`${sectionSelector} .project-visual-stack img`);
    const splitIndex = Math.ceil(fileList.length / 2);
    const imagePools = [fileList.slice(0, splitIndex), fileList.slice(splitIndex)];

    images.forEach((img, index) => {
      const pool = imagePools[index % imagePools.length] || fileList;
      let currentIndex = 0;

      img.src = buildImagePath(folderName, pool[currentIndex]);

      const intervalMs = 4000 + index * 900 + Math.floor(Math.random() * 800);
      const initialDelay = Math.floor(Math.random() * 1200);

      const getNextIndex = () => {
        if (pool.length <= 1) {
          return 0;
        }

        return (currentIndex + 1) % pool.length;
      };

      const nextImage = () => {
        const nextIndex = getNextIndex();
        const nextSrc = buildImagePath(folderName, pool[nextIndex]);

        const preloaded = new Image();
        preloaded.src = nextSrc;
        preloaded.onload = () => {
          img.style.opacity = "0.25";

          const onFadeOut = (event) => {
            if (event.propertyName !== "opacity") return;
            img.removeEventListener("transitionend", onFadeOut);
            currentIndex = nextIndex;
            img.src = nextSrc;
            img.style.opacity = "1";
          };

          img.addEventListener("transitionend", onFadeOut, { once: true });
        };
      };

      const to = setTimeout(() => {
        nextImage();
        const id = setInterval(nextImage, intervalMs);
        _timers.push(id);
      }, initialDelay);
      _timers.push(to);
    });
  }

  // Mobile carousel implementation (manual navigation + dots + swipe)
  function createMobileCarousel(sectionSelector, folderName, fileList) {
    const carousel = document.querySelector(`${sectionSelector} .project-carousel`);
    if (!carousel) return;

    const track = carousel.querySelector(".carousel-track");
    const dots = carousel.querySelector(".carousel-dots");
    const prevBtn = carousel.querySelector(".button-prev");
    const nextBtn = carousel.querySelector(".button-next");

    track.innerHTML = "";
    dots.innerHTML = "";

    fileList.forEach((f, i) => {
      const slide = document.createElement("div");
      slide.className = "carousel-slide";
      const img = document.createElement("img");
      img.src = buildImagePath(folderName, f);
      img.alt = `${folderName} image ${i + 1}`;
      slide.appendChild(img);
      track.appendChild(slide);

      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "carousel-dot";
      dot.dataset.index = i;
      dot.addEventListener("click", () => goTo(i));
      dots.appendChild(dot);
    });

    let currentIndex = 0;

    function update() {
      track.style.transform = `translateX(${-currentIndex * 100}%)`;
      dots.querySelectorAll(".carousel-dot").forEach((d, idx) => d.classList.toggle("active", idx === currentIndex));
    }

    function goTo(i) {
      if (i < 0) i = fileList.length - 1;
      if (i >= fileList.length) i = 0;
      currentIndex = i;
      update();
    }

    prevBtn?.addEventListener("click", () => goTo(currentIndex - 1));
    nextBtn?.addEventListener("click", () => goTo(currentIndex + 1));

    // swipe support
    const container = carousel.querySelector(".carousel-track-container");
    if (container) {
      let startX = 0,
        currentX = 0,
        dragging = false;
      const getX = (e) => (e.touches ? e.touches[0].clientX : e.clientX);
      const onStart = (e) => {
        startX = getX(e);
        dragging = true;
        track.style.transition = "none";
      };
      const onMove = (e) => {
        if (!dragging) return;
        currentX = getX(e);
        const dx = currentX - startX;
        const w = container.getBoundingClientRect().width || 1;
        const pct = (dx / w) * 100;
        track.style.transform = `translateX(${-currentIndex * 100 + pct}%)`;
      };
      const onEnd = (e) => {
        if (!dragging) return;
        dragging = false;
        track.style.transition = "";
        const dx = currentX - startX;
        const w = container.getBoundingClientRect().width || 1;
        if (dx < -w * 0.18) goTo(currentIndex + 1);
        else if (dx > w * 0.18) goTo(currentIndex - 1);
        else goTo(currentIndex);
      };
      container.addEventListener("touchstart", onStart, { passive: true });
      container.addEventListener("touchmove", onMove, { passive: true });
      container.addEventListener("touchend", onEnd);
      container.addEventListener("mousedown", (e) => {
        e.preventDefault();
        onStart(e);
      });
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onEnd);
    }

    update();
  }

  // Initialize visuals depending on viewport width
  function initVisuals() {
    const isMobile = window.innerWidth <= 768;
    clearTimers();
    if (isMobile) {
      // build mobile carousels and hide stacked visuals via CSS
      createMobileCarousel(".masicorp-section", "masicorp", sampleImages(masicorpImages, 10));
      createMobileCarousel(".songezo-section", "songezo", sampleImages(songezoImages, 10));
      // ensure stacked images are left as-is but hidden by CSS on mobile
    } else {
      // desktop: run stacked cycling
      setupCyclingImages(".masicorp-section", "masicorp", masicorpImages);
      setupCyclingImages(".songezo-section", "songezo", songezoImages);
    }
  }

  let _resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(initVisuals, 200);
  });

  // initial
  initVisuals();
});
