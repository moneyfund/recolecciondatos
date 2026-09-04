const hero = document.getElementById('homeHero');

if (hero) {
  const slides = [
    document.getElementById('heroSlideA'),
    document.getElementById('heroSlideB'),
  ];
  const cityLabel = document.getElementById('heroCity');
  const credit = document.getElementById('heroCredit');
  const nextButton = document.getElementById('heroNext');
  const dots = [...document.querySelectorAll('.hero-dot')];

  const photos = [
    {
      city: 'Managua',
      image: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Managua%20skyline.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:Managua_skyline.jpg',
      credit: 'JaredGMP64 · CC BY-SA 4.0',
      position: 'center 48%',
    },
    {
      city: 'Granada',
      image: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Cathedral_of_Granada_Nicaragua.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:Cathedral_of_Granada_Nicaragua.jpg',
      credit: 'Sebastian Scheper · CC BY-SA 4.0',
      position: 'center 43%',
    },
    {
      city: 'León',
      image: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Catedral_de_Le%C3%B3n_Nicaragua.JPG',
      source: 'https://commons.wikimedia.org/wiki/File:Catedral_de_Le%C3%B3n_Nicaragua.JPG',
      credit: 'ArquiWHAT · dominio público',
      position: 'center 48%',
    },
    {
      city: 'Masaya',
      image: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Ciudad_Masaya.jpg',
      source: 'https://commons.wikimedia.org/wiki/File:Ciudad_Masaya.jpg',
      credit: 'AntoLa22 · CC BY-SA 4.0',
      position: 'center 48%',
    },
  ];

  let activeSlide = 0;
  let currentIndex = Math.floor(Math.random() * photos.length);
  let timer = null;
  let isChanging = false;

  function updateMeta(index) {
    const photo = photos[index];
    cityLabel.textContent = `${photo.city}, Nicaragua`;
    credit.textContent = `Foto: ${photo.credit}`;
    credit.href = photo.source;
    credit.setAttribute('aria-label', `Crédito de la fotografía de ${photo.city}`);
    dots.forEach((dot, dotIndex) => dot.classList.toggle('active', dotIndex === index));
  }

  function setSlide(slide, photo) {
    slide.style.backgroundImage = `url("${photo.image}")`;
    slide.style.backgroundPosition = photo.position;
  }

  function showPhoto(index, immediate = false) {
    if (isChanging && !immediate) return;
    const photo = photos[index];
    const nextSlideIndex = immediate ? activeSlide : 1 - activeSlide;
    const nextSlide = slides[nextSlideIndex];

    isChanging = true;
    const loader = new Image();
    loader.decoding = 'async';
    loader.src = photo.image;

    const reveal = () => {
      setSlide(nextSlide, photo);
      updateMeta(index);

      requestAnimationFrame(() => {
        if (immediate) {
          slides.forEach((slide, i) => slide.classList.toggle('active', i === nextSlideIndex));
        } else {
          nextSlide.classList.add('active');
          slides[activeSlide].classList.remove('active');
          activeSlide = nextSlideIndex;
        }
        currentIndex = index;
        window.setTimeout(() => { isChanging = false; }, immediate ? 80 : 1250);
      });
    };

    if (loader.complete) reveal();
    else {
      loader.onload = reveal;
      loader.onerror = () => {
        isChanging = false;
        chooseRandomPhoto();
      };
    }
  }

  function randomDifferentIndex() {
    if (photos.length < 2) return 0;
    let next = currentIndex;
    while (next === currentIndex) next = Math.floor(Math.random() * photos.length);
    return next;
  }

  function chooseRandomPhoto() {
    showPhoto(randomDifferentIndex());
  }

  function restartTimer() {
    window.clearInterval(timer);
    timer = window.setInterval(chooseRandomPhoto, 7000);
  }

  nextButton?.addEventListener('click', () => {
    chooseRandomPhoto();
    restartTimer();
  });

  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      if (index === currentIndex) return;
      showPhoto(index);
      restartTimer();
    });
  });

  hero.addEventListener('mouseenter', () => window.clearInterval(timer));
  hero.addEventListener('mouseleave', restartTimer);

  showPhoto(currentIndex, true);
  restartTimer();

  window.setTimeout(() => {
    photos.forEach((photo, index) => {
      if (index === currentIndex) return;
      const preload = new Image();
      preload.decoding = 'async';
      preload.src = photo.image;
    });
  }, 1200);
}
