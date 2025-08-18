document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("contactForm");
  const submitBtn = form.querySelector(".submit-btn");

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    // Get form data
    const formData = new FormData(form);

    // Change button text to show processing
    const originalText = submitBtn.textContent;
    submitBtn.textContent = "Sending...";
    submitBtn.disabled = true;

    // Submit to Formspree
    fetch("https://formspree.io/f/meoqbawg", {
      method: "POST",
      body: formData,
      headers: {
        Accept: "application/json",
      },
    })
      .then((response) => {
        if (response.ok) {
          // Success
          submitBtn.textContent = "Message Sent!";
          submitBtn.style.background = "#28a745";
          form.reset();

          // Reset button after 3 seconds
          setTimeout(() => {
            submitBtn.textContent = originalText;
            submitBtn.style.background = "";
            submitBtn.disabled = false;
          }, 3000);
        } else {
          throw new Error("Form submission failed");
        }
      })
      .catch((error) => {
        // Error
        submitBtn.textContent = "Error - Try Again";
        submitBtn.style.background = "#dc3545";

        // Reset button after 3 seconds
        setTimeout(() => {
          submitBtn.textContent = originalText;
          submitBtn.style.background = "";
          submitBtn.disabled = false;
        }, 3000);
      });
  });
});
