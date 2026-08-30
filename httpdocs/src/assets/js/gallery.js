import { galleryLocations } from "./galleryData.js";
import { getCurrentLanguage, getTranslation, initializeLanguage } from "./language.js";

let map;
let markers = [];
let routeLine;

let currentIndex = 0;

let lightboxIndex = 0;
let currentLightboxMedia = [];

document.addEventListener("DOMContentLoaded", async () => {
  if (!document.getElementById("journey-map")) {
    return;
  }

  await initializeLanguage(() => {
    syncDocumentLanguage();

    if (!galleryLocations.length) {
      return;
    }

    renderLocation(currentIndex, false);
    updateMarkerPopups();

    const lightbox = document.getElementById("mediaLightbox");

    if (lightbox?.classList.contains("open")) {
      showLightboxMedia(lightboxIndex);
    }
  });

  syncDocumentLanguage();

  initializeGallery();
});

function initializeGallery() {
  if (!Array.isArray(galleryLocations) || galleryLocations.length === 0) {
    document.getElementById("locationName").textContent = getTranslation("no_journey_data");

    return;
  }

  const lastIndex = galleryLocations.length - 1;

  createMap();

  createMarkers();

  setupNavigation();

  setupLightbox();

  selectLocation(lastIndex, false);
}

function createMap() {
  const first = galleryLocations[0];

  map = L.map("journey-map", {
    scrollWheelZoom: true,
    zoomControl: true,
  }).setView([first.latitude, first.longitude], 6);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,

    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(map);

  const routeCoordinates = galleryLocations.map((location) => [location.latitude, location.longitude]);

  routeLine = L.polyline(routeCoordinates, {
    className: "route-line",
    color: "#b77b3a",
    weight: 3,
    opacity: 0.75,
    dashArray: "8 7",
  }).addTo(map);

  if (galleryLocations.length > 1) {
    map.fitBounds(routeLine.getBounds(), {
      padding: [40, 40],
    });
  }
}

function createMarkers() {
  markers = galleryLocations.map((location, index) => {
    const markerIcon = L.divIcon({
      className: "",

      html: `
              <div
                class="journey-marker"
                data-marker-index="${index}">
              </div>
            `,

      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });

    const marker = L.marker([location.latitude, location.longitude], {
      icon: markerIcon,
    }).addTo(map);

    marker.bindPopup(getMarkerPopupHtml(location));

    marker.on("click", () => {
      selectLocation(index, true);
    });

    return marker;
  });
}

function updateMarkerPopups() {
  markers.forEach((marker, index) => {
    const location = galleryLocations[index];

    if (!location) {
      return;
    }

    marker.setPopupContent(getMarkerPopupHtml(location));
  });
}

function getMarkerPopupHtml(location) {
  const locationName = getLocalizedValue(location.location);

  const date = formatDate(location.date);

  return `
    <div class="map-popup">

      <strong>
        ${escapeHtml(locationName)}
      </strong>

      <span>
        ${escapeHtml(date)}
      </span>

    </div>
  `;
}

function selectLocation(index, moveMap = true) {
  if (index < 0 || index >= galleryLocations.length) {
    return;
  }

  currentIndex = index;

  renderLocation(index, moveMap);

  const selectedMarker = markers[index];

  if (selectedMarker) {
    selectedMarker.openPopup();
  }

  if (moveMap && map) {
    const location = galleryLocations[index];

    map.flyTo(
      [location.latitude, location.longitude],

      Math.max(map.getZoom(), 7),

      {
        duration: 0.8,
      },
    );
  }
}

function renderLocation(index, scrollToContent = false) {
  const location = galleryLocations[index];

  if (!location) {
    return;
  }

  const isDepartureSlide = isDepartureLocation(location, index);

  const distanceLabel = document.querySelector(".distance-metric .distance-label");

  const totalDistanceMetric = document.querySelector(".total-distance-metric");

  const totalDistanceValue = document.getElementById("locationTotalDistance");

  document.getElementById("locationName").textContent = getLocalizedValue(location.location);

  document.getElementById("locationDate").textContent = formatDate(location.date);

  document.getElementById("locationDistance").textContent = isDepartureSlide ? getTranslation("day_of_departure") : formatDistance(location.distance);

  document.getElementById("locationDescription").textContent = getLocalizedValue(location.description);

  document.getElementById("locationNumber").textContent = formatNumber(index + 1);

  if (distanceLabel) {
    distanceLabel.style.display = isDepartureSlide ? "none" : "";
  }

  if (totalDistanceMetric) {
    totalDistanceMetric.style.display = isDepartureSlide ? "none" : "";
  }

  if (totalDistanceValue) {
    totalDistanceValue.textContent = isDepartureSlide ? "" : formatDistance(getTotalDistanceForIndex(index));
  }

  document.getElementById("locationCounter").textContent = `${index + 1} / ${galleryLocations.length}`;

  document.getElementById("progressCurrent").textContent = formatNumber(index + 1);

  document.getElementById("progressTotal").textContent = formatNumber(galleryLocations.length);

  document.getElementById("previousButton").disabled = index === 0;

  document.getElementById("nextButton").disabled = index === galleryLocations.length - 1;

  updateMarkerState();

  renderMedia(location.media || []);

  if (scrollToContent) {
    scrollGalleryIntoView();
  }
}

function scrollGalleryIntoView() {
  const galleryContent = document.getElementById("galleryContent");

  if (!galleryContent) {
    return;
  }

  const header = document.querySelector("header");

  const headerOffset = header ? header.offsetHeight + 10 : 20;

  const topPosition = galleryContent.getBoundingClientRect().top + window.scrollY - headerOffset;

  window.scrollTo({
    top: topPosition,
    behavior: "smooth",
  });
}

function isDepartureLocation(location, index) {
  return index === 0 || location.isDeparture === true;
}

function updateMarkerState() {
  markers.forEach((marker, index) => {
    const element = marker.getElement()?.querySelector(".journey-marker");

    if (!element) {
      return;
    }

    element.classList.toggle("active", index === currentIndex);
  });
}

function renderMedia(media) {
  const grid = document.getElementById("mediaGrid");

  grid.innerHTML = "";

  if (!media.length) {
    const message = document.createElement("p");

    message.className = "location-description";

    message.textContent = getTranslation("no_media");

    grid.appendChild(message);

    return;
  }

  media.forEach((item, index) => {
    const card = document.createElement("article");

    card.className = "media-card";

    card.setAttribute("tabindex", "0");

    card.setAttribute("role", "button");

    const altText = getLocalizedValue(item.alt);

    if (item.type === "video") {
      card.innerHTML = `
          <video
            src="${escapeAttribute(item.src)}"

            ${item.poster ? `poster="${escapeAttribute(item.poster)}"` : ""}

            muted
            playsinline
            preload="metadata"

            aria-label="${escapeAttribute(altText || getTranslation("video"))}">
          </video>


          <div class="media-overlay">

            <span class="media-type">

              <span class="video-play-icon">

                <i class="fa-solid fa-play"></i>

              </span>

              ${escapeHtml(getTranslation("video"))}

            </span>

          </div>
        `;
    } else {
      card.innerHTML = `
          <img
            src="${escapeAttribute(item.src)}"

            alt="${escapeAttribute(altText)}"

            loading="lazy">


          <div class="media-overlay">

            <span class="media-type">

              <i class="fa-solid fa-camera"></i>

              <span>
                ${escapeHtml(getTranslation("photo"))}
              </span>

            </span>

          </div>
        `;
    }

    card.addEventListener("click", () => {
      openLightbox(media, index);
    });

    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();

        openLightbox(media, index);
      }
    });

    grid.appendChild(card);
  });
}

function setupNavigation() {
  document.getElementById("previousButton").addEventListener("click", () => {
    if (currentIndex > 0) {
      selectLocation(currentIndex - 1, true);
    }
  });

  document.getElementById("nextButton").addEventListener("click", () => {
    if (currentIndex < galleryLocations.length - 1) {
      selectLocation(currentIndex + 1, true);
    }
  });
}

function setupLightbox() {
  document.getElementById("lightboxClose").addEventListener("click", closeLightbox);

  document.getElementById("lightboxPrev").addEventListener("click", () => {
    showLightboxMedia(lightboxIndex - 1);
  });

  document.getElementById("lightboxNext").addEventListener("click", () => {
    showLightboxMedia(lightboxIndex + 1);
  });

  document.getElementById("mediaLightbox").addEventListener("click", (event) => {
    if (event.target.id === "mediaLightbox") {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", (event) => {
    const lightbox = document.getElementById("mediaLightbox");

    if (!lightbox.classList.contains("open")) {
      return;
    }

    if (event.key === "Escape") {
      closeLightbox();
    }

    if (event.key === "ArrowLeft") {
      showLightboxMedia(lightboxIndex - 1);
    }

    if (event.key === "ArrowRight") {
      showLightboxMedia(lightboxIndex + 1);
    }
  });
}

function openLightbox(media, index) {
  currentLightboxMedia = media;

  lightboxIndex = index;

  const lightbox = document.getElementById("mediaLightbox");

  lightbox.classList.add("open");

  lightbox.setAttribute("aria-hidden", "false");

  document.body.style.overflow = "hidden";

  showLightboxMedia(index);
}

function showLightboxMedia(index) {
  const media = currentLightboxMedia;

  if (!media.length) {
    return;
  }

  if (index < 0) {
    index = media.length - 1;
  }

  if (index >= media.length) {
    index = 0;
  }

  lightboxIndex = index;

  const item = media[index];

  const content = document.getElementById("lightboxContent");

  const altText = getLocalizedValue(item.alt);

  if (item.type === "video") {
    content.innerHTML = `
      <video

        src="${escapeAttribute(item.src)}"

        ${item.poster ? `poster="${escapeAttribute(item.poster)}"` : ""}

        controls
        autoplay
        playsinline

        aria-label="${escapeAttribute(altText || getTranslation("video"))}">

      </video>
    `;
  } else {
    content.innerHTML = `
      <img

        src="${escapeAttribute(item.src)}"

        alt="${escapeAttribute(altText)}">

    `;
  }
}

function closeLightbox() {
  const lightbox = document.getElementById("mediaLightbox");

  const content = document.getElementById("lightboxContent");

  lightbox.classList.remove("open");

  lightbox.setAttribute("aria-hidden", "true");

  document.body.style.overflow = "";

  content.innerHTML = "";

  currentLightboxMedia = [];
}

function getLocalizedValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value !== "object") {
    return String(value);
  }

  const language = getCurrentLanguage();

  return value[language] || value.en || "";
}

function formatDate(isoDate) {
  if (!isoDate) {
    return "";
  }

  const [year, month, day] = String(isoDate).split("-").map(Number);

  if (!year || !month || !day) {
    return String(isoDate);
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  const locale = getCurrentLanguage() === "fr" ? "fr-FR" : "en-GB";

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function getTotalDistanceForIndex(index) {
  return galleryLocations.slice(0, index + 1).reduce((total, location) => {
    return total + getDistanceKm(location);
  }, 0);
}

function getDistanceKm(location) {
  const distance = Number(location.distance);

  if (!Number.isFinite(distance)) {
    return 0;
  }

  return distance;
}

function formatDistance(value) {
  const distance = Number(value);

  if (!Number.isFinite(distance)) {
    return "";
  }

  return `${Math.round(distance)} km`;
}

function formatNumber(number) {
  return String(number).padStart(2, "0");
}

function syncDocumentLanguage() {
  document.documentElement.lang = getCurrentLanguage() === "fr" ? "fr" : "en";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")

    .replaceAll("<", "&lt;")

    .replaceAll(">", "&gt;")

    .replaceAll('"', "&quot;")

    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
