document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contactForm");
  if (!form) return;

  const submitBtn = form.querySelector(".submit-btn");
  if (!submitBtn) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const originalText = submitBtn.textContent;
    submitBtn.textContent = "Sending...";
    submitBtn.disabled = true;

    try {
      const response = await fetch("https://formspree.io/f/meoqbawg", {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });

      if (!response.ok) throw new Error("Form submission failed");

      submitBtn.textContent = "Message Sent!";
      submitBtn.style.background = "#28a745";
      form.reset();
    } catch (error) {
      console.error(error);
      submitBtn.textContent = "Error - Try Again";
      submitBtn.style.background = "#dc3545";
    } finally {
      setTimeout(() => {
        submitBtn.textContent = originalText;
        submitBtn.style.background = "";
        submitBtn.disabled = false;
      }, 3000);
    }
  });
});
