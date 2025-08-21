const video = document.getElementById("responsive-video");

function setVideoSource() {
  const isMobile = window.innerWidth <= 768;
  const src = isMobile ? "../video/Route-Mobile-4x3.mp4" : "../video/Opener Route.mp4";

  if (video.src !== location.origin + "/" + src) {
    video.src = src;
    video.load();
    video.play();
  }
}

// Set on load
window.addEventListener("DOMContentLoaded", setVideoSource);

// Optional: update on resize
window.addEventListener("resize", setVideoSource);
