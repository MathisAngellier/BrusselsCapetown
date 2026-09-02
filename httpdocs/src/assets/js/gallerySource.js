const API_URL = "/api/gallery/locations.php";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isLocalizedText(value) {
  return isRecord(value) && typeof value.en === "string" && typeof value.fr === "string";
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidMedia(item, locationId) {
  if (!isRecord(item) || !["image", "video"].includes(item.type)) return false;
  const extensions = item.type === "image" ? "jpg|jpeg|png|webp|gif" : "mp4|webm|mov|m4v";
  const path = new RegExp(`^/uploads/gallery/${locationId}/[A-Za-z0-9_-]+\\.(?:${extensions})$`, "i");
  return typeof item.src === "string" && path.test(item.src) && isLocalizedText(item.alt);
}

export function validateGalleryResponse(data) {
  if (!isRecord(data) || data.success !== true || !Array.isArray(data.locations)) {
    throw new Error("Invalid gallery API response.");
  }

  const ids = new Set();
  for (const location of data.locations) {
    if (!isRecord(location)
      || !Number.isSafeInteger(location.id) || location.id < 1 || ids.has(location.id)
      || !isValidDate(location.date)
      || !isLocalizedText(location.location) || !isLocalizedText(location.description)
      || !Number.isFinite(location.distance) || location.distance < 0
      || !Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90
      || !Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180
      || !Array.isArray(location.media)
      || !location.media.every((item) => isValidMedia(item, location.id))) {
      throw new Error("Invalid location or media in gallery API response.");
    }
    ids.add(location.id);
  }

  return data.locations;
}

export async function loadGalleryLocations(fallbackLocations, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 8000,
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(API_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`Gallery API returned HTTP ${response.status}.`);
    const locations = validateGalleryResponse(await response.json());
    // A successful empty array is an empty database, not an API failure.
    return { locations, source: "database" };
  } catch {
    console.warn("Gallery API unavailable or invalid; using the static fallback.");
    return { locations: fallbackLocations, source: "fallback" };
  } finally {
    clearTimeout(timer);
  }
}
