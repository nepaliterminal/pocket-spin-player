export function playerScale(width, height) {
  return Math.max(0.15, Math.min(1.6, (width - 24) / 360, (height - 90) / 710));
}

export function installFullscreen(notify, doc = document, win = window) {
  const button = doc.getElementById('fullscreenButton');
  const layoutButton = doc.getElementById('layoutButton');
  let focus = false, wasFullscreen = false;
  try {
    focus = new URLSearchParams(win.location.search).get('app') === '1' ||
      win.sessionStorage.getItem('pocket-spin-player-mode') === 'true';
  } catch { /* Session storage is optional. */ }
  const nativeFullscreen = () => !!doc.fullscreenElement;
  const supported = () => !!doc.documentElement.requestFullscreen && doc.fullscreenEnabled !== false;
  function update() {
    doc.body.classList.toggle('player-mode', focus);
    const viewport = win.visualViewport;
    doc.documentElement.style.setProperty('--player-scale', playerScale(viewport?.width || win.innerWidth, viewport?.height || win.innerHeight));
    button.textContent = nativeFullscreen() ? 'Exit fullscreen' : !supported() && focus ? 'Exit player view' : 'Fullscreen';
    button.setAttribute('aria-pressed', String(nativeFullscreen() || focus));
    layoutButton.hidden = !focus || nativeFullscreen();
    try { win.sessionStorage.setItem('pocket-spin-player-mode', String(focus)); } catch {}
  }
  async function toggle() {
    if (nativeFullscreen()) {
      try { await doc.exitFullscreen(); focus = false; }
      catch { notify('Use your browser’s fullscreen exit control or Escape.'); }
      update(); return;
    }
    if (!supported() && focus) { focus = false; update(); return; }
    focus = true; update();
    if (supported()) {
      try { await doc.documentElement.requestFullscreen({navigationUI:'hide'}); }
      catch { notify('Player-only view is on. This browser did not allow hiding its toolbar.'); }
    } else notify('Player-only view is on. This browser does not support fullscreen.');
    update();
  }
  button.addEventListener('click', toggle);
  layoutButton.addEventListener('click', () => { focus = false; update(); });
  doc.addEventListener('fullscreenchange', () => {
    if (wasFullscreen && !nativeFullscreen()) focus = false;
    if (nativeFullscreen()) focus = true;
    wasFullscreen = nativeFullscreen(); update();
  });
  doc.addEventListener('keydown', event => {
    if (event.key === 'Escape' && focus && !nativeFullscreen()) {
      focus = false; update(); event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  win.addEventListener('resize', update);
  win.visualViewport?.addEventListener('resize', update);
  update();
}
