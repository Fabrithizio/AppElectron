document.querySelectorAll('.topic').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.topic').forEach((item) => {
      item.classList.toggle('active', item === button);
    });

    document.querySelectorAll('.help-section').forEach((section) => {
      section.classList.toggle('active', section.id === button.dataset.target);
    });
  });
});
