document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("contactForm");
  const submitBtn = form.querySelector(".submit-btn");

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    const formData = new FormData(form);

    const originalText = submitBtn.textContent;
    submitBtn.textContent = "Sending...";
    submitBtn.disabled = true;

    fetch("https://formspree.io/f/meoqbawg", {
      method: "POST",
      body: formData,
      headers: {
        Accept: "application/json",
      },
    })
      .then((response) => {
        if (response.ok) {
          submitBtn.textContent = "Message Sent!";
          submitBtn.style.background = "#28a745";
          form.reset();

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
        submitBtn.textContent = "Error - Try Again";
        submitBtn.style.background = "#dc3545";

        setTimeout(() => {
          submitBtn.textContent = originalText;
          submitBtn.style.background = "";
          submitBtn.disabled = false;
        }, 3000);
      });
  });
});
