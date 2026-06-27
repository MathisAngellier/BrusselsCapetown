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
    "5_Songezo1.png",
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
    "5_Songezo2.jpg",
    "5_Songezo20.jpg",
    "5_Songezo21.jpg",
    "5_Songezo22.jpg",
    "5_Songezo23.jpg",
    "5_Songezo24.jpg",
    "5_Songezo25.jpg",
    "5_Songezo26.jpg",
    "5_Songezo27.jpg",
    "5_Songezo3.jpg",
    "5_Songezo4.jpg",
    "5_Songezo5.jpg",
    "5_Songezo6.jpg",
    "5_Songezo7.jpg",
  ];

  const buildImagePath = (folder, filename) => `/img/${folder}/${filename}`;

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

      setTimeout(() => {
        nextImage();
        setInterval(nextImage, intervalMs);
      }, initialDelay);
    });
  }

  setupCyclingImages(".masicorp-section", "masicorp", masicorpImages);
  setupCyclingImages(".songezo-section", "songezo", songezoImages);
});
