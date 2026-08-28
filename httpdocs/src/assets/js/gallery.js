import { galleryLocations } from "./galleryData.js";
import { getCurrentLanguage, initializeLanguage } from "./language.js";

let map;
let markers = [];
let routeLine;
let currentIndex = 0;
let lightboxIndex = 0;

const translations = {
    en: {
        eyebrow: "THE JOURNEY",
        title: "Journey Gallery",
        intro: "Follow the journey day by day through photos, videos and locations from the road.",
        map_eyebrow: "FOLLOW THE ROUTE",
        map_title: "The journey so far",
        location_eyebrow: "LOCATION",
        previous: "Previous",
        next: "Next",
        no_media: "No photos or videos have been added for this location yet.",
        photo: "Photo",
        video: "Video"
    },
    fr: {
        eyebrow: "LE VOYAGE",
        title: "Galerie du voyage",
        intro: "Suivez le voyage jour après jour à travers les photos, vidéos et lieux parcourus.",
        map_eyebrow: "SUIVRE L'ITINÉRAIRE",
        map_title: "Le voyage jusqu'à présent",
        location_eyebrow: "LIEU",
        previous: "Précédent",
        next: "Suivant",
        no_media: "Aucune photo ou vidéo n'a encore été ajoutée pour ce lieu.",
        photo: "Photo",
        video: "Vidéo"
    }
};

document.addEventListener("DOMContentLoaded", () => {
    if (!document.getElementById("journey-map")) return;

    initializeGallery();
    initializeLanguage(async () => {
        applyGalleryTranslations();
        renderLocation(currentIndex, false);
    });
});

function initializeGallery() {
    if (!Array.isArray(galleryLocations) || galleryLocations.length === 0) {
        document.getElementById("locationName").textContent = "No journey data yet";
        return;
    }

    createMap();
    createMarkers();
    renderLocation(0, false);
    setupNavigation();
    setupLightbox();
    applyGalleryTranslations();
}

function createMap() {
    const first = galleryLocations[0];

    map = L.map("journey-map", {
        scrollWheelZoom: true,
        zoomControl: true
    }).setView([first.latitude, first.longitude], 6);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    }).addTo(map);

    const routeCoordinates = galleryLocations.map((location) => [
        location.latitude,
        location.longitude
    ]);

    routeLine = L.polyline(routeCoordinates, {
        className: "route-line",
        color: "#b77b3a",
        weight: 3,
        opacity: 0.75,
        dashArray: "8 7"
    }).addTo(map);

    if (galleryLocations.length > 1) {
        map.fitBounds(routeLine.getBounds(), {
            padding: [40, 40]
        });
    }
}

function createMarkers() {
    markers = galleryLocations.map((location, index) => {
        const markerIcon = L.divIcon({
            className: "",
            html: `<div class="journey-marker" data-marker-index="${index}"></div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11]
        });

        const marker = L.marker(
            [location.latitude, location.longitude],
            { icon: markerIcon }
        ).addTo(map);

        marker.bindPopup(`
            <div class="map-popup">
                <strong>${escapeHtml(location.location)}</strong>
                <span>${escapeHtml(location.date)}</span>
            </div>
        `);

        marker.on("click", () => {
            selectLocation(index, true);
        });

        return marker;
    });
}

function selectLocation(index, moveMap = true) {
    if (index < 0 || index >= galleryLocations.length) return;

    currentIndex = index;
    renderLocation(index, moveMap);

    if (moveMap && map) {
        const location = galleryLocations[index];
        map.flyTo([location.latitude, location.longitude], Math.max(map.getZoom(), 7), {
            duration: 0.8
        });

        markers[index].openPopup();
    }
}

function renderLocation(index, scrollToContent = false) {
    const location = galleryLocations[index];
    if (!location) return;

    document.getElementById("locationName").textContent = location.location;
    document.getElementById("locationDate").textContent = location.date;
    document.getElementById("locationDescription").textContent = location.description || "";
    document.getElementById("locationNumber").textContent = formatNumber(index + 1);

    document.getElementById("locationCounter").textContent =
        `${index + 1} / ${galleryLocations.length}`;

    document.getElementById("progressCurrent").textContent = formatNumber(index + 1);
    document.getElementById("progressTotal").textContent = formatNumber(galleryLocations.length);

    document.getElementById("previousButton").disabled = index === 0;
    document.getElementById("nextButton").disabled = index === galleryLocations.length - 1;

    updateMarkerState();
    renderMedia(location.media || []);

    if (scrollToContent) {
        document.getElementById("galleryContent").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
}

function updateMarkerState() {
    markers.forEach((marker, index) => {
        const element = marker.getElement()?.querySelector(".journey-marker");
        if (!element) return;
        element.classList.toggle("active", index === currentIndex);
    });
}

function renderMedia(media) {
    const grid = document.getElementById("mediaGrid");
    grid.innerHTML = "";

    if (!media.length) {
        const message = document.createElement("p");
        message.className = "location-description";
        message.textContent = getGalleryTranslation("no_media");
        grid.appendChild(message);
        return;
    }

    media.forEach((item, index) => {
        const card = document.createElement("article");
        card.className = "media-card";
        card.setAttribute("tabindex", "0");
        card.setAttribute("role", "button");

        if (item.type === "video") {
            card.innerHTML = `
                <video
                    src="${escapeAttribute(item.src)}"
                    ${item.poster ? `poster="${escapeAttribute(item.poster)}"` : ""}
                    muted
                    playsinline
                    preload="metadata"
                    aria-label="${escapeAttribute(item.alt || getGalleryTranslation("video"))}">
                </video>

                <div class="media-overlay">
                    <span class="media-type">
                        <span class="video-play-icon"><i class="fa-solid fa-play"></i></span>
                        ${getGalleryTranslation("video")}
                    </span>
                </div>
            `;
        } else {
            card.innerHTML = `
                <img
                    src="${escapeAttribute(item.src)}"
                    alt="${escapeAttribute(item.alt || "")}"
                    loading="lazy">

                <div class="media-overlay">
                    <span class="media-type">
                        <i class="fa-solid fa-camera"></i>
                        ${getGalleryTranslation("photo")}
                    </span>
                </div>
            `;
        }

        card.addEventListener("click", () => openLightbox(media, index));
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
        if (!lightbox.classList.contains("open")) return;

        if (event.key === "Escape") closeLightbox();
        if (event.key === "ArrowLeft") showLightboxMedia(lightboxIndex - 1);
        if (event.key === "ArrowRight") showLightboxMedia(lightboxIndex + 1);
    });
}

function openLightbox(media, index) {
    window.currentLightboxMedia = media;
    lightboxIndex = index;

    document.getElementById("mediaLightbox").classList.add("open");
    document.getElementById("mediaLightbox").setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    showLightboxMedia(index);
}

function showLightboxMedia(index) {
    const media = window.currentLightboxMedia || [];
    if (!media.length) return;

    if (index < 0) index = media.length - 1;
    if (index >= media.length) index = 0;

    lightboxIndex = index;

    const item = media[index];
    const content = document.getElementById("lightboxContent");

    if (item.type === "video") {
        content.innerHTML = `
            <video
                src="${escapeAttribute(item.src)}"
                ${item.poster ? `poster="${escapeAttribute(item.poster)}"` : ""}
                controls
                autoplay
                playsinline>
            </video>
        `;
    } else {
        content.innerHTML = `
            <img
                src="${escapeAttribute(item.src)}"
                alt="${escapeAttribute(item.alt || "")}">
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
}

function applyGalleryTranslations() {
    const language = getCurrentLanguage();
    const dictionary = translations[language] || translations.en;

    document.querySelectorAll("[data-gallery-translate]").forEach((element) => {
        const key = element.dataset.galleryTranslate;
        if (dictionary[key]) {
            element.textContent = dictionary[key];
        }
    });

    // Re-render media labels when the language changes.
    const currentLocation = galleryLocations[currentIndex];
    if (currentLocation) {
        renderMedia(currentLocation.media || []);
    }
}

function getGalleryTranslation(key) {
    const language = getCurrentLanguage();
    return (translations[language] || translations.en)[key] || translations.en[key] || key;
}

function formatNumber(number) {
    return String(number).padStart(2, "0");
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
