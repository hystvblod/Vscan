// app.js – VScanPro (logique principale)

// == Globales ==
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const LANGS = window.VSCAN_LANGS;
let currentLang = localStorage.getItem('vscan_lang') || 'fr';
let isPremium = localStorage.getItem('vscan_premium') === '1';
let darkMode = localStorage.getItem('vscan_dark') === '1';
let currentImage = null, currentMask = [], currentSignature = null, currentWatermark = null, currentPassword = '', currentCachet = false;
let signatureInfo = null, signatureOverlay = null;
let docTypeDetected = '';
let history = [];

// == Initialisation UI ==
document.addEventListener('DOMContentLoaded', () => {
  // Initialisation langues UI
  setLang(currentLang);

  // Appliquer le dark mode si besoin
  if (darkMode) document.body.classList.add('dark');

  // Menu langues
  $('#language-switcher').value = currentLang;
  $('#language-switcher').addEventListener('change', e => {
    currentLang = e.target.value;
    localStorage.setItem('vscan_lang', currentLang);
    setLang(currentLang);
  });

  // Toggle dark/light mode
  $('#theme-toggle').addEventListener('click', () => {
    darkMode = !darkMode;
    document.body.classList.toggle('dark', darkMode);
    localStorage.setItem('vscan_dark', darkMode ? '1' : '0');
  });

  // Premium toggle (simulateur)
  $('#premium-btn').addEventListener('click', () => {
    isPremium = !isPremium;
    localStorage.setItem('vscan_premium', isPremium ? '1' : '0');
    updatePremiumUI();
    alert(isPremium ? "Premium activé" : "Premium désactivé");
  });

  updatePremiumUI();

  // Actions principales
  $('#scan-btn').addEventListener('click', () => startScan());
  $('#import-btn').addEventListener('click', () => importFromGallery());
  $('#history-btn').addEventListener('click', showHistory);

  // Fermetures zones
  $('#close-work-area').addEventListener('click', closeWorkArea);
  $('#close-history').addEventListener('click', closeHistory);
  $('#close-options').addEventListener('click', () => $('#options-modal').classList.add('hidden'));

  // Actions de la zone de scan
  $('#add-signature').addEventListener('click', addSignature);
  $('#add-watermark').addEventListener('click', () => {
    if (!isPremium) return alert("Premium requis pour le filigrane.");
    showOptionsModal('watermark');
  });
  $('#mask-tool').addEventListener('click', () => {
    if (!isPremium) return alert("Premium requis pour masquer.");
    activateMaskTool();
  });
  $('#options-btn').addEventListener('click', () => showOptionsModal());
  $('#export-pdf').addEventListener('click', exportPDF);

  // Options du document (modal)
  $('#open-signature-advanced').addEventListener('click', () => {
    if (!isPremium) return alert("Premium requis pour la signature avancée.");
    addSignature(true);
  });
  $('#watermark-text').addEventListener('input', e => { currentWatermark = e.target.value; });
  $('#watermark-color').addEventListener('input', e => { /* handled in exportPDF */ });
  $('#watermark-opacity').addEventListener('input', e => { /* handled in exportPDF */ });
  $('#watermark-position').addEventListener('change', e => { /* handled in exportPDF */ });
  $('#pdf-password').addEventListener('input', e => { currentPassword = e.target.value; });
  $('#add-seal').addEventListener('change', e => { currentCachet = !!e.target.checked; });

  // Promo banner editable
  $('#promo-text').addEventListener('dblclick', () => {
    const nv = prompt("Modifier texte de la promo :", $('#promo-text').innerText);
    if (nv && nv.length < 70) $('#promo-text').innerText = nv;
  });
  $('#promo-link').addEventListener('dblclick', () => {
    const link = $('#promo-link');
    const nv = prompt("Modifier le lien de la promo :", link.href);
    if (nv && nv.startsWith('http')) {
      link.href = nv;
      link.rel = 'noopener noreferrer';
    }
  });

  // Init promo image change
  $('#promo-banner img').addEventListener('dblclick', () => {
    const nv = prompt("URL de l'image (https...png/svg/jpg) :", $('#promo-banner img').src);
    if (nv && (nv.endsWith('.png') || nv.endsWith('.jpg') || nv.endsWith('.svg'))) $('#promo-banner img').src = nv;
  });

  // Initialiser historique
  loadHistory();

  // Cacher pub si premium
  if (isPremium) $('#promo-banner').style.display = 'none';
});

function setLang(lang) {
  document.querySelectorAll('[data-t]').forEach(el => {
    const key = el.getAttribute('data-t');
    if (LANGS[lang] && LANGS[lang][key]) el.textContent = LANGS[lang][key];
  });
  document.querySelectorAll('[data-title]').forEach(el => {
    const key = el.getAttribute('data-title');
    if (LANGS[lang] && LANGS[lang][key]) el.title = LANGS[lang][key];
  });
  currentLang = lang;
  if (signatureOverlay) {
    signatureOverlay.title = LANGS[lang].signature_hint;
  }
}

function updatePremiumUI() {
  $$('button.premium, .premium').forEach(el => {
    el.disabled = !isPremium;
    el.classList.toggle('locked', !isPremium);
    el.title = isPremium ? "" : "Premium requis";
  });
  // Cacher la pub
  $('#promo-banner').style.display = isPremium ? 'none' : 'flex';
}

// === Scan & Import ===
function startScan() {
  // Utilisation de l'input file accept camera
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';
  input.onchange = e => {
    const file = e.target.files[0];
    if (file) readImageFile(file);
  };
  input.click();
}

function importFromGallery() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = e => {
    const file = e.target.files[0];
    if (file) readImageFile(file);
  };
  input.click();
}

function readImageFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      currentImage = img;
      showWorkArea();
      drawScanCanvas(img);
      detectDocType(img);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// === Affichage & zone de travail ===
function showWorkArea() {
  $('#main-actions').classList.add('hidden');
  $('#work-area').classList.remove('hidden');
}

function closeWorkArea() {
  $('#work-area').classList.add('hidden');
  $('#main-actions').classList.remove('hidden');
  currentImage = null;
  clearCanvas();
  if (signatureOverlay) {
    signatureOverlay.remove();
    signatureOverlay = null;
    signatureInfo = null;
  }
}

function drawScanCanvas(img) {
  const canvas = $('#scan-canvas');
  const ctx = canvas.getContext('2d');
  // Ajuster la taille du canvas
  const maxW = 480, maxH = 340;
  let w = img.width, h = img.height;
  if (w > maxW) { h *= maxW / w; w = maxW; }
  if (h > maxH) { w *= maxH / h; h = maxH; }
  canvas.width = w;
  canvas.height = h;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img, 0, 0, w, h);
  // Si masque actif, afficher (ex. floutage)
  if (currentMask && currentMask.length) drawMask(ctx, w, h);
  updateSignatureOverlay();
}

function clearCanvas() {
  const canvas = $('#scan-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
}

// === Détection automatique du type de document (basique OCR simulé) ===
function detectDocType(img) {
  // (Simulation, OCR réel dans la version complète)
  // Basé sur la dimension : > largeur/hauteur typique, sinon random
  if (!img) { $('#doc-type-detected').innerText = "-"; return; }
  if (img.width > img.height*1.2) {
    docTypeDetected = 'doc_facture';
  } else if (img.height > img.width*1.1) {
    docTypeDetected = 'doc_pieceid';
  } else {
    docTypeDetected = 'doc_note';
  }
  $('#doc-type-detected').innerText = LANGS[currentLang][docTypeDetected] || '-';
}
// === Signature (simple & avancée) ===
function addSignature(advanced = false) {
  // Ouvre un modal de signature (canvas)
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content" style="text-align:center;min-width:260px;max-width:99vw;">
      <h3>${LANGS[currentLang].add_signature}</h3>
      <canvas id="signature-canvas" width="340" height="110"
        style="border-radius:0.8rem;box-shadow:0 2px 8px #2948;"
      ></canvas>
      <div style="margin:1.2rem 0 0.7rem 0;">
        ${advanced ? `
          <input type="color" id="sig-color" value="#222" title="Couleur" />
          <input type="range" id="sig-size" min="2" max="14" value="5" style="vertical-align:middle;" title="Épaisseur" />
        ` : ``}
        <button id="sig-clear" style="margin-left:1.1rem">${LANGS[currentLang].close}</button>
        <button id="sig-validate" style="margin-left:1.1rem">${LANGS[currentLang].confirm}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Signature dessinée sur canvas
  const sigCanvas = modal.querySelector('#signature-canvas');
  const sigCtx = sigCanvas.getContext('2d');
  let drawing = false, lastX=0, lastY=0;
  let sigColor = advanced ? modal.querySelector('#sig-color').value : "#222";
  let sigSize = advanced ? +modal.querySelector('#sig-size').value : 4;

  if (advanced) {
    modal.querySelector('#sig-color').addEventListener('input', e => { sigColor = e.target.value; });
    modal.querySelector('#sig-size').addEventListener('input', e => { sigSize = +e.target.value; });
  }

  // Événements pour signature souris/tactile
  sigCanvas.addEventListener('mousedown', e => { drawing=true; [lastX,lastY]=[e.offsetX,e.offsetY]; });
  sigCanvas.addEventListener('mouseup', ()=>{drawing=false;});
  sigCanvas.addEventListener('mouseleave', ()=>{drawing=false;});
  sigCanvas.addEventListener('mousemove', e => {
    if(!drawing) return;
    sigCtx.strokeStyle = sigColor;
    sigCtx.lineWidth = sigSize;
    sigCtx.lineCap = 'round';
    sigCtx.beginPath();
    sigCtx.moveTo(lastX, lastY);
    sigCtx.lineTo(e.offsetX, e.offsetY);
    sigCtx.stroke();
    [lastX, lastY] = [e.offsetX, e.offsetY];
  });
  // Version tactile mobile
  sigCanvas.addEventListener('touchstart', e => {
    drawing = true;
    const rect = sigCanvas.getBoundingClientRect();
    const t = e.touches[0];
    lastX = t.clientX - rect.left;
    lastY = t.clientY - rect.top;
    e.preventDefault();
  });
  sigCanvas.addEventListener('touchend', ()=>{drawing=false;});
  sigCanvas.addEventListener('touchcancel', ()=>{drawing=false;});
  sigCanvas.addEventListener('touchmove', e => {
    if(!drawing) return;
    const rect = sigCanvas.getBoundingClientRect();
    const t = e.touches[0];
    const x = t.clientX - rect.left;
    const y = t.clientY - rect.top;
    sigCtx.strokeStyle = sigColor;
    sigCtx.lineWidth = sigSize;
    sigCtx.lineCap = 'round';
    sigCtx.beginPath();
    sigCtx.moveTo(lastX, lastY);
    sigCtx.lineTo(x, y);
    sigCtx.stroke();
    [lastX, lastY] = [x, y];
    e.preventDefault();
  });

  modal.querySelector('#sig-clear').addEventListener('click', () => {
    sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  });
  modal.querySelector('#sig-validate').addEventListener('click', () => {
    // Enregistre la signature comme image data
    currentSignature = sigCanvas.toDataURL("image/png");
    document.body.removeChild(modal);
    // Redessine sur le scan-canvas (preview)
    if (currentImage) drawScanCanvas(currentImage);
    createSignatureOverlay();
  });
  // Fermer si clic hors du modal
  modal.addEventListener('click', e => {
    if (e.target === modal) document.body.removeChild(modal);
  });
}

function createSignatureOverlay() {
  if (!currentSignature) return;
  const container = document.querySelector('.canvas-container');
  const canvas = document.getElementById('scan-canvas');
  if (signatureOverlay) signatureOverlay.remove();
  signatureOverlay = document.createElement('img');
  signatureOverlay.src = currentSignature;
  signatureOverlay.className = 'signature-overlay';
  signatureOverlay.title = LANGS[currentLang].signature_hint;
  container.appendChild(signatureOverlay);

  signatureOverlay.onload = () => {
    if (!signatureInfo) {
      const scale = canvas.offsetWidth / 340;
      const w = 150 * scale;
      const h = 48 * scale;
      signatureInfo = {
        x: (canvas.offsetWidth - w - 20) / canvas.offsetWidth,
        y: (canvas.offsetHeight - h - 12) / canvas.offsetHeight,
        scale: w / canvas.offsetWidth
      };
    }
    updateSignatureOverlay();
  };

  initSignatureHandlers();
}

function updateSignatureOverlay() {
  if (!signatureOverlay || !signatureInfo || !currentImage) return;
  const canvas = document.getElementById('scan-canvas');
  const w = signatureInfo.scale * canvas.offsetWidth;
  const h = w * (signatureOverlay.naturalHeight / signatureOverlay.naturalWidth);
  signatureOverlay.style.width = w + 'px';
  signatureOverlay.style.left = (canvas.offsetLeft + signatureInfo.x * canvas.offsetWidth) + 'px';
  signatureOverlay.style.top = (canvas.offsetTop + signatureInfo.y * canvas.offsetHeight) + 'px';
}

function overlaySignature(ctx = $('#scan-canvas').getContext('2d')) {
  if (!signatureOverlay || !signatureInfo) return;
  const canvas = document.getElementById('scan-canvas');
  const w = signatureInfo.scale * canvas.width;
  const h = w * (signatureOverlay.naturalHeight / signatureOverlay.naturalWidth);
  ctx.save();
  ctx.globalAlpha = 0.93;
  ctx.drawImage(signatureOverlay, signatureInfo.x * canvas.width, signatureInfo.y * canvas.height, w, h);
  ctx.restore();
}

function initSignatureHandlers() {
  if (!signatureOverlay) return;
  const canvas = document.getElementById('scan-canvas');
  const supportsPointer = 'onpointerdown' in window;
  const activePointers = new Map();
  let startScale = 1, startDist = 0, lastX = 0, lastY = 0;

  function start(e) {
    if (supportsPointer) {
      signatureOverlay.setPointerCapture(e.pointerId);
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    } else {
      Array.from(e.touches).forEach(t => {
        activePointers.set(t.identifier, { x: t.clientX, y: t.clientY });
      });
    }
    if (activePointers.size === 1) {
      signatureOverlay.classList.add('dragging');
      const p = Array.from(activePointers.values())[0];
      lastX = p.x; lastY = p.y;
    } else if (activePointers.size >= 2) {
      const pts = Array.from(activePointers.values());
      startDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      startScale = signatureInfo.scale;
    }
    e.preventDefault();
  }

  function move(e) {
    if (supportsPointer) {
      if (!activePointers.has(e.pointerId)) return;
      const prev = activePointers.get(e.pointerId);
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    } else {
      Array.from(e.touches).forEach(t => {
        if (activePointers.has(t.identifier)) {
          activePointers.set(t.identifier, { x: t.clientX, y: t.clientY });
        }
      });
    }

    if (activePointers.size === 1) {
      const p = Array.from(activePointers.values())[0];
      const dx = p.x - lastX;
      const dy = p.y - lastY;
      signatureInfo.x += dx / canvas.offsetWidth;
      signatureInfo.y += dy / canvas.offsetHeight;
      lastX = p.x; lastY = p.y;
      updateSignatureOverlay();
    } else if (activePointers.size >= 2) {
      const pts = Array.from(activePointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      signatureInfo.scale = Math.max(0.1, Math.min(2.5, startScale * dist / startDist));
      updateSignatureOverlay();
    }
    e.preventDefault();
  }

  function end(e) {
    if (supportsPointer) {
      signatureOverlay.releasePointerCapture(e.pointerId);
      activePointers.delete(e.pointerId);
    } else {
      Array.from(e.changedTouches).forEach(t => activePointers.delete(t.identifier));
    }
    if (activePointers.size === 0) {
      signatureOverlay.classList.remove('dragging');
    } else if (activePointers.size === 1) {
      const only = Array.from(activePointers.values())[0];
      startScale = signatureInfo.scale;
      startDist = 0;
      lastX = only.x; lastY = only.y;
    }
    e.preventDefault();
  }

  if (supportsPointer) {
    signatureOverlay.addEventListener('pointerdown', start);
    signatureOverlay.addEventListener('pointermove', move);
    signatureOverlay.addEventListener('pointerup', end);
    signatureOverlay.addEventListener('pointercancel', end);
  } else {
    signatureOverlay.addEventListener('touchstart', start, { passive: false });
    signatureOverlay.addEventListener('touchmove', move, { passive: false });
    signatureOverlay.addEventListener('touchend', end);
    signatureOverlay.addEventListener('touchcancel', end);
  }
}

// === Masque / Floutage (Premium) ===
function activateMaskTool() {
  if (!isPremium) return;
  const overlay = document.getElementById('mask-overlay');
  const canvas = document.getElementById('scan-canvas');
  // Toggle mode
  const active = overlay.dataset.active === '1';
  if (active) {
    overlay.dataset.active = '';
    overlay.style.pointerEvents = 'none';
    overlay.style.cursor = '';
    overlay.innerHTML = '';
    if (currentImage) {
      drawScanCanvas(currentImage);
      updateSignatureOverlay();
    }
    overlay.removeEventListener('mousedown', onDown);
    overlay.removeEventListener('mousemove', onMove);
    overlay.removeEventListener('mouseup', onUp);
    overlay.removeEventListener('mouseleave', onUp);
    overlay.removeEventListener('touchstart', onDown);
    overlay.removeEventListener('touchmove', onMove);
    overlay.removeEventListener('touchend', onUp);
    overlay.removeEventListener('touchcancel', onUp);
    return;
  }

  // Prepare overlay
  overlay.dataset.active = '1';
  overlay.style.pointerEvents = 'auto';
  overlay.style.cursor = 'crosshair';
  overlay.style.width = canvas.offsetWidth + 'px';
  overlay.style.height = canvas.offsetHeight + 'px';
  overlay.innerHTML = '';

  // Existing mask
  currentMask.forEach(m => {
    const d = document.createElement('div');
    d.className = 'mask-rect';
    d.style.left = (m.x * overlay.offsetWidth) + 'px';
    d.style.top = (m.y * overlay.offsetHeight) + 'px';
    d.style.width = (m.w * overlay.offsetWidth) + 'px';
    d.style.height = (m.h * overlay.offsetHeight) + 'px';
    overlay.appendChild(d);
  });

  let startX = 0, startY = 0, drawing = false, rectDiv = null;

  function pos(e) {
    const t = e.touches ? e.touches[0] : e;
    const r = overlay.getBoundingClientRect();
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  function onDown(e) {
    drawing = true;
    const p = pos(e);
    startX = p.x; startY = p.y;
    rectDiv = document.createElement('div');
    rectDiv.className = 'mask-rect';
    rectDiv.style.left = startX + 'px';
    rectDiv.style.top = startY + 'px';
    overlay.appendChild(rectDiv);
    e.preventDefault();
  }

  function onMove(e) {
    if (!drawing) return;
    const p = pos(e);
    const l = Math.min(startX, p.x);
    const t = Math.min(startY, p.y);
    const w = Math.abs(p.x - startX);
    const h = Math.abs(p.y - startY);
    rectDiv.style.left = l + 'px';
    rectDiv.style.top = t + 'px';
    rectDiv.style.width = w + 'px';
    rectDiv.style.height = h + 'px';
    e.preventDefault();
  }

  function onUp(e) {
    if (!drawing) return;
    drawing = false;
    const r = rectDiv.getBoundingClientRect();
    const base = overlay.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) {
      overlay.removeChild(rectDiv);
    } else {
      currentMask.push({
        x: (r.left - base.left) / base.width,
        y: (r.top - base.top) / base.height,
        w: r.width / base.width,
        h: r.height / base.height
      });
    }
    rectDiv = null;
    e.preventDefault();
  }

  overlay.addEventListener('mousedown', onDown);
  overlay.addEventListener('mousemove', onMove);
  overlay.addEventListener('mouseup', onUp);
  overlay.addEventListener('mouseleave', onUp);
  overlay.addEventListener('touchstart', onDown, { passive: false });
  overlay.addEventListener('touchmove', onMove, { passive: false });
  overlay.addEventListener('touchend', onUp);
  overlay.addEventListener('touchcancel', onUp);
}

function drawMask(ctx, w, h) {
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.globalAlpha = 0.45;
  currentMask.forEach(m => {
    ctx.fillRect(m.x * w, m.y * h, m.w * w, m.h * h);
  });
  ctx.restore();
}

// === Filigrane (Premium) ===
function overlayWatermark(ctx, w, h) {
  if (!isPremium) return;
  const txt = $('#watermark-text').value;
  if (!txt) return;
  ctx.save();
  ctx.globalAlpha = ($('#watermark-opacity').value || 25) / 100;
  ctx.font = `bold ${Math.floor(w/9)}px Poppins, Arial, sans-serif`;
  ctx.fillStyle = $('#watermark-color').value || "#888";
  let pos = $('#watermark-position').value;
  if (pos === "center") {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, w/2, h/2);
  } else if (pos === "diagonal") {
    ctx.translate(w/2, h/2);
    ctx.rotate(-Math.PI/5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, 0, 0);
    ctx.rotate(Math.PI/5);
    ctx.translate(-w/2, -h/2);
  } else { // bottom
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(txt, w/2, h-10);
  }
  ctx.restore();
}
// === Export PDF ===
function exportPDF() {
  if (!currentImage) return;
  // jsPDF requis (CDN), mais ici export natif canvas→PDF simplifié pour exemple
  import("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js").then(jsPDFmod => {
    const { jsPDF } = jsPDFmod;
    const canvas = $('#scan-canvas');
    const ctx = canvas.getContext('2d');
    // Création d'une image avec les overlays
    // Redessiner image + mask + watermark + signature
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);
    if (currentMask && currentMask.length) drawMask(ctx, canvas.width, canvas.height);
    if (isPremium) overlayWatermark(ctx, canvas.width, canvas.height);
    overlaySignature();
    // Cachet (Premium)
    if (isPremium && $('#add-seal').checked) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#f9b17a";
      ctx.font = `bold ${Math.floor(canvas.width/13)}px Arial`;
      ctx.textAlign = 'left';
      ctx.fillText(`VScanPro • ${new Date().toLocaleString()}`, 14, canvas.height-14);
      ctx.restore();
    }

    // PDF
    const pdf = new jsPDF({
      orientation: canvas.width >= canvas.height ? 'l' : 'p',
      unit: 'pt',
      format: [canvas.width, canvas.height]
    });
    pdf.addImage(canvas.toDataURL("image/jpeg",0.92), "JPEG", 0, 0, canvas.width, canvas.height);

    // Mot de passe PDF (Premium)
    let pwd = isPremium ? $('#pdf-password').value : '';
    if (isPremium && pwd && pdf.setPassword) {
      pdf.setPassword(pwd);
    }

    // Export
    const fname = `VScanPro_${new Date().toISOString().slice(0,10)}.pdf`;
    const blob = pdf.output('blob');

    const shareFile = () => {
      const file = new File([blob], fname, { type: 'application/pdf' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: fname }).catch(err => console.error('Share failed', err));
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fname;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    };

    shareFile();

    // Historique
    saveToHistory(canvas.toDataURL("image/jpeg",0.92), fname);

    // Simule une pub sur export si non premium
    if (!isPremium) setTimeout(() => {
      alert("Publicité (exemple): Essayez VScanPro Premium pour exporter sans pubs !");
    }, 250);
  });
}

// === Historique ===
function saveToHistory(imgData, name) {
  // Limite 10 si non premium
  let hist = JSON.parse(localStorage.getItem('vscan_hist') || "[]");
  if (!isPremium && hist.length >= 10) hist.shift();
  hist.push({
    name,
    img: imgData,
    date: new Date().toLocaleString(),
    type: docTypeDetected
  });
  localStorage.setItem('vscan_hist', JSON.stringify(hist));
  loadHistory();
}

function loadHistory() {
  history = JSON.parse(localStorage.getItem('vscan_hist') || "[]");
}

function showHistory() {
  $('#main-actions').classList.add('hidden');
  $('#history-area').classList.remove('hidden');
  renderHistory();
}

function closeHistory() {
  $('#history-area').classList.add('hidden');
  $('#main-actions').classList.remove('hidden');
}

function renderHistory() {
  const list = $('#history-list');
  list.innerHTML = "";
  if (!history.length) {
    list.innerHTML = `<div style="text-align:center;color:#888;padding:2.4rem 0;">${LANGS[currentLang].history_empty}</div>`;
    return;
  }
  history.slice().reverse().forEach((item, i) => {
    const div = document.createElement('div');
    div.className = "history-item";
    div.innerHTML = `
      <img class="history-thumb" src="${item.img}" alt="doc"/>
      <div class="history-info">
        <div class="history-title">${item.name}</div>
        <div class="history-meta">
          ${item.date}
          <span style="margin-left:0.7rem">${LANGS[currentLang][item.type] || ""}</span>
        </div>
      </div>
      <div class="history-actions">
        <button class="open-btn">${LANGS[currentLang].open}</button>
        <button class="rename-btn">${LANGS[currentLang].rename}</button>
        <button class="delete-btn">${LANGS[currentLang].delete}</button>
      </div>
    `;
    // Actions
    div.querySelector('.open-btn').onclick = () => {
      // Ouvre dans la zone scan
      const img = new Image();
      img.onload = () => {
        currentImage = img;
        showWorkArea();
        drawScanCanvas(img);
        detectDocType(img);
      };
      img.src = item.img;
    };
    div.querySelector('.rename-btn').onclick = () => {
      const nv = prompt("Renommer :", item.name);
      if (nv) {
        history[history.length-1-i].name = nv;
        localStorage.setItem('vscan_hist', JSON.stringify(history));
        renderHistory();
      }
    };
    div.querySelector('.delete-btn').onclick = () => {
      if (confirm("Supprimer ce document ?")) {
        history.splice(history.length-1-i,1);
        localStorage.setItem('vscan_hist', JSON.stringify(history));
        renderHistory();
      }
    };
    list.appendChild(div);
  });
}
// === Options du document ===
function showOptionsModal(focus) {
  $('#options-modal').classList.remove('hidden');
  if (focus === 'watermark') {
    $('#watermark-text').focus();
  }
}

// Historique : marquer comme important (Premium)
function markAsImportant(index) {
  if (!isPremium) return alert("Premium requis pour cette fonction.");
  history[index].important = true;
  localStorage.setItem('vscan_hist', JSON.stringify(history));
  renderHistory();
}

// === OCR / Détection type document (simulé) ===
// Tu peux intégrer tesseract.js ici si tu veux l’OCR complet
// Pour l’instant, c’est un placeholder selon la taille de l’image (déjà géré plus haut)

// === Helpers & accessibilité ===

// Petite aide pour focus clavier, gestion modale accessible
document.addEventListener('keydown', e => {
  // Echapp pour fermer modaux
  if (e.key === "Escape") {
    const modals = document.querySelectorAll('.modal:not(.hidden)');
    modals.forEach(m => m.classList.add('hidden'));
  }
});

// Gestion focus boutons dans modaux
document.addEventListener('keydown', e => {
  if (e.key === "Tab") {
    const modals = document.querySelectorAll('.modal:not(.hidden)');
    if (modals.length) {
      const focusables = modals[0].querySelectorAll('button, input, select, textarea');
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
});

// Tooltip premium sur hover des options
$$('.premium').forEach(el => {
  el.addEventListener('mouseenter', () => {
    if (!isPremium) el.title = "Disponible uniquement en Premium";
  });
});

// Gestion du resize responsive du canvas
window.addEventListener('resize', () => {
  if (currentImage && $('#work-area') && !$('#work-area').classList.contains('hidden')) {
    drawScanCanvas(currentImage);
    updateSignatureOverlay();
  }
});

// Amélioration accessibilité pour les lecteurs d'écran
document.body.setAttribute('aria-label', 'VScanPro – Scanner PDF et Signature');

// === PWA & Améliorations mobiles (optionnel) ===

// Ajout d’un manifest pour installation possible en PWA (option)
// Place un manifest.json et cette balise dans <head> si besoin
// <link rel="manifest" href="manifest.json">

// Installe l’événement avant-install-prompt (optionnel)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  // Tu peux ajouter un bouton "Ajouter à l'écran d'accueil" qui appelle e.prompt()
  window.deferredPrompt = e;
});

// Service worker pour le mode offline (optionnel)
// if ('serviceWorker' in navigator) {
//   navigator.serviceWorker.register('sw.js');
// }

// == FIN ==

console.log("VScanPro prêt !");
