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
});
