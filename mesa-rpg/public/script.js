/* ---------- Início do script.js (modificado com fix de névoa e iluminação) ---------- */
/* Observação: este é o arquivo completo que existe em public/script.js do seu ZIP,
   com as duas correções aplicadas. Substitua o seu script.js por este se preferir. */

(() => {
  const socket = io();

  // ---------- State ----------
  let clientId = null;
  let username = null;
  let role = null;
  let players = [];
  let tokens = [];
  let maps = [];
  let musicList = [];
  let currentMusicState = { filename: null, playing: false, time: 0, volume: 1.0, loop: false, index: -1 };
  let globalFogDataUrl = null;
  let lightsEnabled = true;

  // Canvas
  const mapCanvas = document.getElementById("mapCanvas");
  const fogCanvas = document.getElementById("fogCanvas");
  const ctx = mapCanvas.getContext("2d");
  const fogCtx = fogCanvas.getContext("2d");
  let mapImage = null;
  let mapNaturalWidth = 1, mapNaturalHeight = 1;
  let scale = 1, offsetX = 0, offsetY = 0;
  const MIN_SCALE = 0.3, MAX_SCALE = 3.0;

  // Interaction
  let isDragging = false, dragToken = null, dragOffsetX = 0, dragOffsetY = 0;
  let isResizing = false, resizeToken = null;
  let panMode = false, panStartX = 0, panStartY = 0;

  // Fog drawing
  let fogMode = null; // null | 'paint' | 'erase'
  let fogBrush = parseInt(document.getElementById("fogBrushSize").value || "40", 10);
  let isFogDrawing = false;
  let suppressFogReloadUntilSaved = false;

  // Audio
  const audio = new Audio(); audio.crossOrigin = "anonymous"; audio.loop = false; let localVolume = 1.0;

  // UI refs
  const topRole = document.getElementById("topRole");
  const zoomLabel = document.getElementById("zoomLabel");
  const mapSelect = document.getElementById("mapSelect");
  const loadMapBtn = document.getElementById("loadMapBtn");
  const uploadMapBtn = document.getElementById("uploadMapBtn");
  const mapUploadInput = document.getElementById("mapUploadInput");
  const tokenSelect = document.getElementById("tokenSelect");
  const addTokenBtn = document.getElementById("addTokenBtn");
  const addTokenColorBtn = document.getElementById("addTokenColorBtn");
  const tokenFileInput = document.getElementById("tokenFileInput");
  const musicListEl = document.getElementById("music-list");
  const musicUploadBtn = document.getElementById("musicUploadBtn");
  const musicUploadInput = document.getElementById("musicUploadInput");
  const musicRefreshBtn = document.getElementById("musicRefreshBtn");
  const musicPlayBtn = document.getElementById("musicPlay");
  const musicPauseBtn = document.getElementById("musicPause");
  const musicStopBtn = document.getElementById("musicStop");
  const musicPrevBtn = document.getElementById("musicPrev");
  const musicNextBtn = document.getElementById("musicNext");
  const musicLoopChk = document.getElementById("musicLoop");
  const musicVolume = document.getElementById("musicVolume");
  const musicNow = document.getElementById("musicNow");
  const chatMessages = document.getElementById("chat-messages");
  const chatInput = document.getElementById("chat-input");
  const chatSend = document.getElementById("chat-send");
  const diceButtons = document.querySelectorAll(".dice");
  const notesArea = document.getElementById("notesArea");
  const saveNotesBtn = document.getElementById("saveNotesBtn");
  const notesSavedIndicator = document.getElementById("notesSavedIndicator");
  const playerListEl = document.getElementById("playerList");

  // popup refs
  const popup = document.getElementById("tokenPopup");
  const popupNameEl = document.getElementById("popup-token-name");
  const popupOwnerSelect = document.getElementById("popup-owner-select");
  const popupVariationSelect = document.getElementById("popup-variation-select");
  const popupCloseBtn = document.getElementById("popup-close");
  const popupAssignBtn = document.getElementById("popup-assign");
  const popupRemoveAssignBtn = document.getElementById("popup-remove-assign");
  const popupDeleteBtn = document.getElementById("popup-delete");
  const popupAddVariationBtn = document.getElementById("popup-add-variation");
  const popupVariationFile = document.getElementById("popup-variation-file");
  const popupLightRange = document.getElementById("popup-light-range");
  const popupLightNumber = document.getElementById("popup-light-number");
  const popupSetLightBtn = document.getElementById("popup-set-light");

  // login + fog controls + lights checkbox
  const loginModal = document.getElementById("loginModal");
  const loginName = document.getElementById("loginName");
  const loginMasterBtn = document.getElementById("loginMaster");
  const loginPlayerBtn = document.getElementById("loginPlayer");
  const loginProceed = document.getElementById("loginProceed");
  const paintFogBtn = document.getElementById("paintFogBtn");
  const eraseFogBtn = document.getElementById("eraseFogBtn");
  const clearFogBtn = document.getElementById("clearFogBtn");
  const viewAsPlayerChk = document.getElementById("viewAsPlayerChk");
  const fogBrushSizeInput = document.getElementById("fogBrushSize");
  const lightsEnabledChk = document.getElementById("lightsEnabledChk");
  const masterNotesWrapper = document.getElementById("masterNotesWrapper");

  // ---------- Helpers ----------
  function fileToDataURL(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); }); }
  function escapeHtml(s){ return (s||'').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function idNow(){ return `${Date.now()}-${Math.floor(Math.random()*10000)}`; }

  // ---------- Login ----------
  function showLoginModal(){
    loginModal.style.display = "flex";
    loginName.value = "";
    loginMasterBtn.classList.remove("ghost");
    loginPlayerBtn.classList.add("ghost");
    loginMasterBtn.onclick = ()=>{ loginMasterBtn.classList.remove("ghost"); loginPlayerBtn.classList.add("ghost"); loginModal.dataset.role="master"; };
    loginPlayerBtn.onclick = ()=>{ loginPlayerBtn.classList.remove("ghost"); loginMasterBtn.classList.add("ghost"); loginModal.dataset.role="player"; };
    loginModal.dataset.role = "player";
    loginProceed.onclick = ()=> {
      const name = (loginName.value || "SemNome").toString().substring(0,60);
      const r = loginModal.dataset.role || "player";
      username = name; role = r;
      loginModal.style.display = "none";
      socket.emit("join", { username, role });
      topRole.textContent = `${username} — ${role === "master" ? "Mestre" : "Jogador"}`;
      socket.emit("requestFullState");
    };
  }

  // ---------- Socket handlers ----------
  socket.on("connect", ()=>{ clientId = socket.id; showLoginModal(); });

  socket.on("init", state => {
    players = state.players || [];
    tokens = state.tokens || [];
    maps = (state.maps || []).map(p => p.startsWith('/') ? p : `/${p}`);
    musicList = state.musicFiles || [];
    currentMusicState = state.musicState || currentMusicState;
    globalFogDataUrl = state.fog || null;
    lightsEnabled = (state.lightsEnabled !== undefined) ? state.lightsEnabled : true;
    if (state.masterSocketId && state.masterSocketId === socket.id) role = "master";
    renderPlayers(); renderTokensSelect(); populateMapList(); populateMusicList();
    applyMusicStateLocally();
    loadNotesForMe(state.notes || {});
    if (state.currentMap) safeLoadMapByUrl(state.currentMap);
    renderFogFromServer();
    lightsEnabledChk.checked = !!lightsEnabled;
    enforcePermissionsUI();
    draw();
  });

  socket.on("fullState", state => {
    players = state.players || players;
    tokens = state.tokens || tokens;
    maps = (state.maps || maps).map(p => p.startsWith('/') ? p : `/${p}`);
    musicList = state.musicFiles || musicList;
    currentMusicState = state.musicState || currentMusicState;
    globalFogDataUrl = state.fog || globalFogDataUrl;
    lightsEnabled = (state.lightsEnabled !== undefined) ? state.lightsEnabled : lightsEnabled;
    renderPlayers(); renderTokensSelect(); populateMapList(); populateMusicList();
    applyMusicStateLocally();
    loadNotesForMe(state.notes || {});
    if (state.currentMap) safeLoadMapByUrl(state.currentMap);
    renderFogFromServer();
    lightsEnabledChk.checked = !!lightsEnabled;
    enforcePermissionsUI();
    draw();
  });

  socket.on("players", pls => { players = pls || []; renderPlayers(); populateOwnerSelect(); });
  socket.on("tokenFlipped", data => {
  const t = tokens.find(x => x.id === data.id);
  if (t) {
    t.flipX = data.flipX;
    draw();
  }
});

  socket.on("tokens", ts => { tokens = ts || []; renderTokensSelect(); draw(); redrawFogOverlay(); });
  socket.on("maps", ms => { maps = (ms||[]).map(p => p.startsWith('/') ? p : `/${p}`); populateMapList(); });
  socket.on("musicFiles", list => { musicList = list || []; populateMusicList(); });
  socket.on("musicState", st => { currentMusicState = st || currentMusicState; applyMusicStateLocally(); });
  socket.on("chat", msgs => renderChat(msgs));
  socket.on("noteSaved", ({ socketId, note }) => {
    try { window.__notes = window.__notes || {}; if (socketId) window.__notes[socketId] = note; } catch(e){}
    if (role === "master") renderMasterNotes(window.__notes || {});
    if (socketId === socket.id) loadNotesForMe(window.__notes || {});
  });

  socket.on("fogUpdated", ({ dataUrl }) => {
    globalFogDataUrl = dataUrl || null;
    if (!isFogDrawing && !suppressFogReloadUntilSaved) renderFogFromServer();
  });

  socket.on("lightsToggled", ({ enabled }) => {
    lightsEnabled = !!enabled;
    lightsEnabledChk.checked = lightsEnabled;
    draw(); redrawFogOverlay();
  });

  socket.on("loadMap", ({ url }) => { if (url) safeLoadMapByUrl(url); });

  socket.on("disconnect", ()=> showToast("Desconectado"));

  // ---------- UI population ----------
  function populateMapList(){
    mapSelect.innerHTML = "<option value=''> (Selecione) </option>";
    (maps||[]).forEach(m => {
      const name = m.startsWith('/') ? m : `/${m}`;
      const o = document.createElement("option"); o.value = name; o.textContent = name.replace(/^\/?maps\//,'');
      mapSelect.appendChild(o);
    });
  }

  function populateMusicList(){
    musicListEl.innerHTML = "";
    (musicList||[]).forEach(fname => {
      const li = document.createElement("li");
      li.textContent = fname;
      li.onclick = () => { if (role !== "master") return; socket.emit("playMusic", { filename: `music/${fname}`, time: 0 }); };
      musicListEl.appendChild(li);
    });
  }

  function renderPlayers(){
    playerListEl.innerHTML = "";
    players.forEach(p => {
      const li = document.createElement("li");
      li.textContent = p.username + (p.role === "master" ? " (Mestre)" : "");
      playerListEl.appendChild(li);
    });
    populateOwnerSelect();
  }

  function renderTokensSelect(){
    tokenSelect.innerHTML = "<option value=''> (Selecione) </option>";
    tokens.forEach(t => {
      const o = document.createElement("option"); o.value = t.id; o.textContent = t.name || t.id;
      tokenSelect.appendChild(o);
    });
  }

  function populateOwnerSelect(){
    popupOwnerSelect.innerHTML = "<option value=''> (Nenhum) </option>";
    players.forEach(p => {
      if (p.role !== "master") {
        const opt = document.createElement("option"); opt.value = p.id; opt.textContent = p.username;
        popupOwnerSelect.appendChild(opt);
      }
    });
  }

  // ---------- Map loading & drawing ----------
  function safeLoadMapByUrl(url){
    if (!url) return;
    if (mapImage && mapImage.src === url) return;
    loadMapByUrl(url);
  }
  function loadMapByUrl(url){
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      mapImage = img;
      mapNaturalWidth = img.naturalWidth || img.width;
      mapNaturalHeight = img.naturalHeight || img.height;
      fitMapToCanvas();
      draw();
      showToast("Mapa carregado");
    };
    img.onerror = ()=> showToast("Falha ao carregar mapa");
    img.src = url;
  }
  function fitMapToCanvas(){
    if (!mapImage) return;
    const cw = mapCanvas.width, ch = mapCanvas.height;
    const scaleX = cw / mapNaturalWidth, scaleY = ch / mapNaturalHeight;
    scale = Math.min(scaleX, scaleY, 1.5);
    offsetX = (cw - mapNaturalWidth * scale) / 2;
    offsetY = (ch - mapNaturalHeight * scale) / 2;
    updateZoomLabel();
  }

  function updateZoomLabel(){ zoomLabel.textContent = Math.round(scale * 100) + "%"; }

  function resizeCanvas(){
    mapCanvas.width = window.innerWidth;
    mapCanvas.height = window.innerHeight;
    fogCanvas.width = window.innerWidth;
    fogCanvas.height = window.innerHeight;
    fitMapToCanvas();
    renderFogFromServer();
    draw();
  }
  window.addEventListener("resize", resizeCanvas);
  setTimeout(resizeCanvas, 60);

  function worldToScreen(wx, wy){
    return { x: wx * scale + offsetX, y: wy * scale + offsetY };
  }
  function screenToWorld(sx, sy){
    const rect = mapCanvas.getBoundingClientRect();
    const cx = sx - rect.left;
    return { x: (cx - offsetX) / scale, y: (sy - rect.top - offsetY) / scale };
  }

  function draw(){
    ctx.clearRect(0,0,mapCanvas.width,mapCanvas.height);
    if (mapImage) {
      ctx.save();
      ctx.setTransform(scale,0,0,scale,offsetX,offsetY);
      ctx.drawImage(mapImage, 0, 0, mapNaturalWidth, mapNaturalHeight);
      ctx.restore();
    } else {
      ctx.fillStyle = "#070717"; ctx.fillRect(0,0,mapCanvas.width,mapCanvas.height);
    }
    tokens.forEach(t => drawToken(t));
    // fog + lights composited after map/tokens
    drawFogAndLights();
  }

  function drawToken(t){
    const imgUrl = (t.variations && Number.isInteger(t.currentVariationIndex) && t.variations[t.currentVariationIndex]) ? t.variations[t.currentVariationIndex] : t.image;
    if (imgUrl) {
      if (!t._img) { t._img = new Image(); t._img.src = imgUrl; t._img.onload = draw; }
      if (t._img && t._img.complete) {
        ctx.save();
        ctx.setTransform(scale,0,0,scale,offsetX,offsetY);
        if (t.flipX) {
 	ctx.save();
 	ctx.scale(-1, 1);
	ctx.drawImage(t._img, -(t.x + t.width), t.y, t.width, t.height);
  	ctx.restore();
	} else {
  	ctx.drawImage(t._img, t.x, t.y, t.width, t.height);
 }
        ctx.restore();
      } else {
        ctx.fillStyle = t.color || "#999";
        const s = worldToScreen(t.x, t.y);
        ctx.fillRect(s.x, s.y, t.width*scale, t.height*scale);
      }
    } else {
      ctx.fillStyle = t.color || "#999";
      const s = worldToScreen(t.x, t.y);
      ctx.fillRect(s.x, s.y, t.width*scale, t.height*scale);
    }
    if (t.name) {
      ctx.save(); ctx.font = `${14}px Arial`; ctx.fillStyle = "#eaffff";
      const p = worldToScreen(t.x, t.y - 0.5);
      ctx.fillText(t.name, p.x + 4, p.y - 8); ctx.restore();
    }
    if (role === "master") {
      ctx.save(); ctx.setTransform(scale,0,0,scale,offsetX,offsetY); ctx.fillStyle = "rgba(0,191,255,0.9)"; ctx.fillRect(t.x + t.width - 8, t.y + t.height - 8, 8, 8); ctx.restore();
    }
  }

  // ---------- Fog + Lights ----------
  function drawFogAndLights(){
    // don't erase fogCanvas here; fog is managed separately
    if (lightsEnabled) applyLightsToFog();
  }

  function applyLightsToFog(){
    fogCtx.save();
    fogCtx.globalCompositeOperation = 'destination-out';
    // reset transform to ensure no accumulation
    fogCtx.setTransform(1,0,0,1,0,0);
    const visible = tokens.filter(t => t && t.lightRadius > 0);
    visible.forEach(t => {
      const r = t.lightRadius * scale;
      if (!r) return;
      const cx = (t.x + t.width/2) * scale + offsetX;
      const cy = (t.y + t.height/2) * scale + offsetY;
      // 90% fully transparent center, 10% soft border
      const inner = Math.max(0, r * 0.9);
      const grd = fogCtx.createRadialGradient(cx, cy, inner, cx, cy, r);
      // For destination-out, use white->transparent stops to erase center and soften edges
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      fogCtx.fillStyle = grd;
      fogCtx.beginPath();
      fogCtx.arc(cx, cy, r, 0, Math.PI * 2);
      fogCtx.fill();
    });
    fogCtx.restore();
  }

  function redrawFogOverlay(){
    // Reset any transform to avoid accumulation (prevents 'thinning' on repeated redraws)
    fogCtx.save();
    fogCtx.setTransform(1,0,0,1,0,0);
    fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
    fogCtx.restore();

    if (!globalFogDataUrl) {
      if (lightsEnabled) applyLightsToFog();
      return;
    }
    const img = new Image();
    img.onload = () => {
      fogCtx.save();
      // draw saved fog in world space using the current scale/offset
      fogCtx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
      fogCtx.drawImage(img, 0, 0, mapNaturalWidth, mapNaturalHeight);
      fogCtx.restore();
      if (lightsEnabled) applyLightsToFog();
    };
    img.src = globalFogDataUrl;
  }

  // ---------- Mouse / token events ----------
  function getTokenAtScreen(sx, sy){
    const w = screenToWorld(sx, sy);
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i];
      if (w.x >= t.x && w.x <= t.x + t.width && w.y >= t.y && w.y <= t.y + t.height) return t;
    }
    return null;
  }
  function getHandleUnderScreen(sx, sy, t){
    if (!t) return null;
    const rect = worldToScreen(t.x + t.width - 8, t.y + t.height - 8);
    if (Math.abs(sx - rect.x) <= 12 && Math.abs(sy - rect.y) <= 12) return 'se';
    return null;
  }

  mapCanvas.addEventListener("mousedown", e => {
    if (e.button === 2) { panMode = true; panStartX = e.clientX; panStartY = e.clientY; mapCanvas.style.cursor = "grabbing"; return; }
    const t = getTokenAtScreen(e.clientX, e.clientY);
    if (t) {
      const handle = getHandleUnderScreen(e.clientX, e.clientY, t);
      if (handle && role === "master") { isResizing = true; resizeToken = t; return; }
      if (t && (role === "master" || t.owner === socket.id || (t.allowedUsers && t.allowedUsers.includes(socket.id)))) {
        isDragging = true; dragToken = t; const w = screenToWorld(e.clientX, e.clientY); dragOffsetX = w.x - t.x; dragOffsetY = w.y - t.y; hidePopup(); draw(); redrawFogOverlay(); return;
      }
    }
    hidePopup();
  });

  mapCanvas.addEventListener("mousemove", e => {
    if (panMode) { const dx = e.clientX - panStartX, dy = e.clientY - panStartY; panStartX = e.clientX; panStartY = e.clientY; offsetX += dx; offsetY += dy; draw(); redrawFogOverlay(); return; }
    if (isResizing && resizeToken) { const w = screenToWorld(e.clientX, e.clientY); resizeToken.width = Math.max(8, w.x - resizeToken.x); resizeToken.height = Math.max(8, w.y - resizeToken.y); socket.emit("moveToken", { id: resizeToken.id, x: resizeToken.x, y: resizeToken.y, width: resizeToken.width, height: resizeToken.height }); draw(); redrawFogOverlay(); return; }
    if (isDragging && dragToken) { const w = screenToWorld(e.clientX, e.clientY); dragToken.x = w.x - dragOffsetX; dragToken.y = w.y - dragOffsetY; socket.emit("moveToken", { id: dragToken.id, x: dragToken.x, y: dragToken.y, width: dragToken.width, height: dragToken.height }); draw(); redrawFogOverlay(); return; }
    const t = getTokenAtScreen(e.clientX, e.clientY); const handle = t ? getHandleUnderScreen(e.clientX, e.clientY, t) : null;
    mapCanvas.style.cursor = handle ? "nwse-resize" : (t ? "grab" : "default");
  });

  window.addEventListener("mouseup", e => {
    if (panMode) { panMode = false; mapCanvas.style.cursor = "default"; return; }
    if (isResizing) { isResizing = false; resizeToken = null; }
    if (isDragging && dragToken) { socket.emit("moveToken", { id: dragToken.id, x: dragToken.x, y: dragToken.y, width: dragToken.width, height: dragToken.height }); }
    isDragging = false; dragToken = null;
  });

  mapCanvas.addEventListener("dblclick", e => {
    const t = getTokenAtScreen(e.clientX, e.clientY);
    if (t) {
      const s = worldToScreen(t.x + t.width/2, t.y + t.height/2);
      showPopupForToken(t, s.x, s.y);
    }
  });

  // ---------- Zoom ----------
  mapCanvas.addEventListener("wheel", e => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.12 : 0.88;
    const oldScale = scale;
    scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * delta));
    const rect = mapCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const wx = (mouseX - offsetX) / oldScale;
    const wy = (mouseY - offsetY) / oldScale;
    offsetX = mouseX - wx * scale;
    offsetY = mouseY - wy * scale;
    updateZoomLabel();
    draw();
    redrawFogOverlay();
  });

  // ---------- Fog painting ----------
  fogCanvas.style.pointerEvents = "auto";
  fogBrushSizeInput.addEventListener("input", () => { fogBrush = parseInt(fogBrushSizeInput.value || "40", 10); });

  function setFogMode(mode){
    fogMode = mode;
    paintFogBtn.style.opacity = mode === 'paint' ? "1" : "0.7";
    eraseFogBtn.style.opacity = mode === 'erase' ? "1" : "0.7";
  }

  paintFogBtn.onclick = () => { if (role !== "master") return; setFogMode(fogMode === 'paint' ? null : 'paint'); };
  eraseFogBtn.onclick = () => { if (role !== "master") return; setFogMode(fogMode === 'erase' ? null : 'erase'); };

  fogCanvas.addEventListener("mousedown", e => {
    if (role !== "master" || !fogMode) return;
    isFogDrawing = true;
    suppressFogReloadUntilSaved = true;
    drawFogStroke(e.clientX, e.clientY);
  });
  fogCanvas.addEventListener("mousemove", e => { if (!isFogDrawing) return; if (role !== "master" || !fogMode) return; drawFogStroke(e.clientX, e.clientY); });
  window.addEventListener("mouseup", e => {
    if (isFogDrawing) {
      isFogDrawing = false;
      saveFogToServer().then(()=> { setTimeout(()=>{ suppressFogReloadUntilSaved = false; }, 150); });
    }
  });

  function drawFogStroke(clientX, clientY){
    // convert to map/world coords
    const rect = fogCanvas.getBoundingClientRect();
    const wx = (clientX - rect.left - offsetX) / scale;
    const wy = (clientY - rect.top - offsetY) / scale;
    // effective brush in world units (so brush scales with zoom)
    const worldBrush = (fogBrush || 40) / scale;

    fogCtx.save();
    // draw in world-space: set transform so drawing aligns with map coords
    fogCtx.setTransform(scale, 0, 0, scale, offsetX, offsetY);

    if (fogMode === 'paint') {
      fogCtx.globalCompositeOperation = 'source-over';
      fogCtx.fillStyle = 'rgba(0,0,0,0.9)';
    } else if (fogMode === 'erase') {
      fogCtx.globalCompositeOperation = 'destination-out';
      fogCtx.fillStyle = 'rgba(0,0,0,1)';
    }

    fogCtx.beginPath();
    fogCtx.arc(wx, wy, worldBrush, 0, Math.PI*2);
    fogCtx.fill();
    fogCtx.restore();

    try { globalFogDataUrl = fogCanvas.toDataURL('image/png'); } catch(e){}
  }

  function clearFog(){
    if (role !== "master") return alert("Apenas o Mestre pode limpar a névoa.");
    if (!confirm("Limpar toda a névoa do mapa?")) return;
    fogCtx.clearRect(0,0,fogCanvas.width,fogCanvas.height);
    globalFogDataUrl = null;
    socket.emit("saveFog", { dataUrl: null });
  }

  function saveFogToServer(){
    try {
      const dataUrl = fogCanvas.toDataURL('image/png');
      globalFogDataUrl = dataUrl;
      socket.emit("saveFog", { dataUrl });
      return Promise.resolve();
    } catch(e){ console.error("failed save fog", e); return Promise.reject(e); }
  }

  function renderFogFromServer(){
    if (!globalFogDataUrl) {
      fogCtx.clearRect(0,0,fogCanvas.width,fogCanvas.height);
      if (lightsEnabled) applyLightsToFog();
      enforceFogVisibility();
      return;
    }
    if (isFogDrawing || suppressFogReloadUntilSaved) return;
    const img = new Image();
    img.onload = () => {
      fogCtx.clearRect(0,0,fogCanvas.width,fogCanvas.height);
      fogCtx.save();
      // draw saved fog in world space
      fogCtx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
      fogCtx.drawImage(img, 0, 0, mapNaturalWidth, mapNaturalHeight);
      fogCtx.restore();
      if (lightsEnabled) applyLightsToFog();
      enforceFogVisibility();
    };
    img.onerror = ()=> { console.warn("fog image load failed"); enforceFogVisibility(); };
    img.src = globalFogDataUrl;
  }

  // ---------- Popup logic (now includes light controls) ----------
  function showPopupForToken(t, screenX, screenY){
    popup.style.display = "block"; popup.setAttribute("aria-hidden","false");
    popupNameEl.textContent = t.name || `Token ${t.id}`;
    popupVariationSelect.innerHTML = "<option value=''> (Nenhum) </option>";
    if (t.variations && t.variations.length) {
      t.variations.forEach((u,idx)=> { const o=document.createElement("option"); o.value=idx; o.textContent=`Variação ${idx+1}`; if (t.currentVariationIndex===idx) o.selected=true; popupVariationSelect.appendChild(o); });
    }
    popupOwnerSelect.value = t.owner || "";
    const left = Math.min(window.innerWidth - 320, screenX + 14);
    popup.style.left = left + "px"; popup.style.top = Math.max(10, screenY - 10) + "px";

    popupAssignBtn.onclick = ()=> { if (role !== "master") return alert("Apenas o Mestre pode atribuir."); const pid = popupOwnerSelect.value || null; socket.emit("assignToken",{ tokenId: t.id, playerSocketId: pid }); popup.style.display = "none"; };
    popupRemoveAssignBtn.onclick = ()=> { if (role !== "master") return; socket.emit("assignToken",{ tokenId: t.id, playerSocketId: null }); popup.style.display = "none"; };
    popupDeleteBtn.onclick = ()=> { if (role !== "master") return; if (!confirm("Excluir token?")) return; socket.emit("deleteToken", t.id); popup.style.display = "none"; };
    popupVariationSelect.onchange = ()=> { const idx = parseInt(popupVariationSelect.value); if (!isNaN(idx)) socket.emit("changeTokenVariation",{ tokenId: t.id, index: idx }); };

    const worldRadius = t.lightRadius || 0;
    popupLightRange.value = worldRadius;
    popupLightNumber.value = worldRadius;
    popupLightRange.oninput = () => { popupLightNumber.value = popupLightRange.value; };
    popupLightNumber.oninput = () => { popupLightRange.value = popupLightNumber.value; };

    popupSetLightBtn.onclick = () => {
      if (role !== "master") return alert("Apenas o Mestre pode ajustar iluminação.");
      const val = parseInt(popupLightRange.value || "0", 10);
      socket.emit("setLightRadius", { tokenId: t.id, radius: val });
      popup.style.display = "none";
    };
// botão de flip horizontal
if (!document.getElementById("popup-flipX")) {
  const flipBtn = document.createElement("button");
  flipBtn.id = "popup-flipX";
  flipBtn.className = "small ghost";
  flipBtn.textContent = "Flip Horizontal";
  popupSetLightBtn.parentNode.appendChild(flipBtn);

  flipBtn.onclick = () => {
    if (role !== "master") return alert("Apenas o Mestre pode virar tokens.");
    const newVal = !t.flipX;
    socket.emit("flipToken", { id: t.id, flipX: newVal });
    popup.style.display = "none";
  };
}

    popupAddVariationBtn.onclick = ()=> { if (role !== "master") return alert("Apenas o Mestre pode adicionar variações."); popupVariationFile.click(); };
    popupVariationFile.onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const data = await fileToDataURL(f);
      const res = await fetch("/uploadTokenImage",{ method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ filename:f.name, data })});
      const j = await res.json().catch(()=>null);
      if (j && (j.url || j.filename)) {
        const url = j.url || `/tokens/${j.filename}`;
        socket.emit("addTokenVariation",{ tokenId: t.id, url });
      } else showToast("Upload da variação falhou");
      popupVariationFile.value = null;
    };

    if (role !== "master") {
      popupAssignBtn.disabled = true; popupRemoveAssignBtn.disabled = true; popupDeleteBtn.disabled = true; popupAddVariationBtn.disabled = true; popupSetLightBtn.disabled = true;
    } else {
      popupAssignBtn.disabled = false; popupRemoveAssignBtn.disabled = false; popupDeleteBtn.disabled = false; popupAddVariationBtn.disabled = false; popupSetLightBtn.disabled = false;
    }
    popupCloseBtn.onclick = ()=> { hidePopup(); };
  }
  function hidePopup(){ popup.style.display = "none"; popup.setAttribute("aria-hidden","true"); }

  // ---------- Token add/upload ----------
  addTokenBtn.onclick = ()=> {
    if (role !== "master") return alert("Apenas o Mestre pode adicionar tokens.");
    tokenFileInput.click();
  };
  tokenFileInput.onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const data = await fileToDataURL(f);
    const res = await fetch("/uploadTokenImage",{ method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ filename:f.name, data })});
    const j = await res.json().catch(()=>null);
    const url = j && (j.url || j.filename) ? (j.url || `/tokens/${j.filename}`) : null;
    const t = { id: idNow(), x: 80, y: 80, width: 60, height: 60, name: f.name, owner: socket.id, image: url, variations: [], currentVariationIndex: 0, lightRadius: 0, flipX: false };
    socket.emit("addToken", t);
    tokenFileInput.value = null;
  };

  addTokenColorBtn.onclick = ()=> {
    if (role !== "master") return alert("Apenas o Mestre pode adicionar tokens.");
    const t = { id: idNow(), x: 120, y: 120, width: 60, height: 60, name: "Token", owner: socket.id, image: null, color: randomColor(), variations: [], currentVariationIndex: 0, lightRadius: 0, flipX: false };
    socket.emit("addToken", t);
  };

  function randomColor(){ const cs=["#e74c3c","#3498db","#2ecc71","#9b59b6","#f1c40f","#e67e22","#1abc9c","#9ed6ff"]; return cs[Math.floor(Math.random()*cs.length)]; }

  // ---------- Map upload & load ----------
  uploadMapBtn.onclick = ()=> { if (role !== "master") return alert("Apenas o Mestre pode enviar mapas."); mapUploadInput.click(); };
  mapUploadInput.onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const data = await fileToDataURL(f);
    const res = await fetch("/uploadMapImage",{ method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ filename:f.name, data })});
    const j = await res.json().catch(()=>null);
    if (j && (j.filename || j.url)) {
      const url = j.url || `/maps/${j.filename}`;
      socket.emit("addMap",{ filename: j.filename || f.name, url });
      socket.emit("loadMap",{ url });
    } else showToast("Upload falhou");
    mapUploadInput.value = null;
  };

  loadMapBtn.onclick = ()=> {
    if (role !== "master") return alert("Apenas o Mestre pode carregar mapas.");
    const u = mapSelect.value; if (!u) return alert("Selecione um mapa."); socket.emit("loadMap",{ url: u });
  };

  // ---------- Lights toggle ----------
  lightsEnabledChk.onchange = () => {
    if (role !== "master") { lightsEnabledChk.checked = lightsEnabled; return alert("Apenas o Mestre pode alterar a iluminação."); }
    lightsEnabled = !!lightsEnabledChk.checked;
    socket.emit("setLightsEnabled", { enabled: lightsEnabled });
  };

  // ---------- Music ----------
  musicUploadBtn.onclick = ()=> { if (role !== "master") return alert("Apenas o Mestre pode enviar músicas."); musicUploadInput.click(); };
  musicUploadInput.onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const data = await fileToDataURL(f);
    const res = await fetch("/uploadMusic",{ method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ filename:f.name, data })});
    const j = await res.json().catch(()=>null);
    if (j && j.filename) socket.emit("requestMusicList");
    musicUploadInput.value = null;
  };
  musicRefreshBtn.onclick = ()=> socket.emit("requestMusicList");
  musicPlayBtn.onclick = ()=> { if (role !== "master") return alert("Apenas o Mestre controla a reprodução."); if (!currentMusicState.filename && musicList.length) socket.emit("playMusic",{ filename: `music/${musicList[0]}`, time:0 }); else socket.emit("playMusic",{ filename: currentMusicState.filename, time: audio.currentTime||0 }); };
  musicPauseBtn.onclick = ()=> { if (role !== "master") return alert("Apenas o Mestre controla a reprodução."); socket.emit("pauseMusic",{ time: audio.currentTime||0 }); };
  musicStopBtn.onclick = ()=> { if (role !== "master") return alert("Apenas o Mestre controla a reprodução."); socket.emit("stopMusic"); };
  musicPrevBtn.onclick = ()=> { if (role !== "master") return socket.emit("prevTrack"); socket.emit("prevTrack"); };
  musicNextBtn.onclick = ()=> { if (role !== "master") return socket.emit("nextTrack"); socket.emit("nextTrack"); };
  musicLoopChk.onchange = ()=> { audio.loop = !!musicLoopChk.checked; if (role === "master") socket.emit("setMusicLoop",{ loop: !!musicLoopChk.checked }); };
  musicVolume.oninput = ()=> { const v = parseFloat(musicVolume.value); localVolume = v; audio.volume = (currentMusicState.volume ?? 1.0) * localVolume; if (role === "master") socket.emit("setVolume",{ volume: v }); };

  function applyMusicStateLocally(){
    const st = currentMusicState || {};
    if (!st.filename) { try{ audio.pause(); audio.src = ""; } catch(e){} musicNow.textContent = "(Nenhuma faixa)"; return; }
    const src = st.filename.startsWith('/') ? st.filename : `/${st.filename}`;
    if (audio.dataset?.src !== src) { audio.dataset = audio.dataset || {}; audio.dataset.src = src; audio.src = src; audio.loop = !!st.loop; }
    audio.volume = (st.volume ?? 1.0) * localVolume;
    try { if (!isNaN(st.time) && Math.abs((audio.currentTime||0) - (st.time||0)) > 1.2) audio.currentTime = st.time || 0; } catch(e){}
    if (st.playing) audio.play().catch(()=>{}); else audio.pause();
    musicNow.textContent = st.filename.replace(/^music\//,'') + (st.playing ? " ▶" : " ⏸");
    musicLoopChk.checked = !!st.loop;
  }

  audio.addEventListener("play", ()=> { if (role === "master") socket.emit("musicCommand",{ cmd:"play", time: audio.currentTime }); });
  audio.addEventListener("pause", ()=> { if (role === "master") socket.emit("musicCommand",{ cmd:"pause", time: audio.currentTime }); });
  audio.addEventListener("timeupdate", throttleTimeUpdate);
  function throttleTimeUpdate(){ if (role === "master") { if (!throttleTimeUpdate._last || Date.now() - throttleTimeUpdate._last > 1000) { throttleTimeUpdate._last = Date.now(); socket.emit("musicTime",{ time: audio.currentTime }); } } }

  // ---------- Chat + dice ----------
  chatSend.onclick = sendChat;
  chatInput.addEventListener("keydown", e => { if (e.key === "Enter") sendChat(); });
  diceButtons.forEach(b => b.addEventListener("click", ()=> { const d = parseInt(b.dataset.d,10); if (!isNaN(d)) sendRoll(d); }));

  function sendChat(){
    const txt = chatInput.value.trim(); if (!txt) return;
    const rollMatch = txt.match(/^\/roll\s+(\d+)?d(\d+)\s*$/i) || txt.match(/^\/roll\s+d(\d+)\s*$/i);
    if (rollMatch) {
      let count = 1, sides = 20;
      const m = txt.match(/^\/roll\s+(\d+)d(\d+)/i);
      if (m) { count = parseInt(m[1],10); sides = parseInt(m[2],10); } else { const mm = txt.match(/^\/roll\s+d(\d+)/i); if (mm) sides = parseInt(mm[1],10); }
      sendRoll(sides, count); chatInput.value = ""; return;
    }
    socket.emit("chatMessage",{ text: txt, username });
    chatInput.value = "";
  }

  function sendRoll(sides, count = 1){
    count = Math.max(1, Math.min(100, count));
    const results = [];
    for (let i=0;i<count;i++) results.push(1 + Math.floor(Math.random()*sides));
    const total = results.reduce((a,b)=>a+b,0);
    const msg = { username, roll: true, notation: `${count}d${sides}`, results, total, time: Date.now() };
    socket.emit("chatRoll", msg);
    appendChatMessage({ username, roll:true, notation: msg.notation, results: msg.results, total: msg.total });
  }

  function renderChat(list){
    chatMessages.innerHTML = "";
    (list||[]).forEach(m => appendChatMessage(m));
  }

  function appendChatMessage(m){
    const div = document.createElement("div");
    if (m.roll) {
      div.innerHTML = `<b style="color:#bfeaff">${escapeHtml(m.username)}</b>: 🎲 <i>${escapeHtml(m.notation)}</i> → [${(m.results||[]).join(", ")}] = <b>${m.total}</b>`;
    } else {
      div.innerHTML = `<b style="color:#bfeaff">${escapeHtml(m.username)}</b>: ${escapeHtml(m.text)}`;
    }
    chatMessages.appendChild(div); chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // ---------- Notes ----------
  saveNotesBtn.onclick = ()=> {
    const txt = notesArea.value || "";
    socket.emit("saveNote",{ text: txt, lastEdit: Date.now() });
    notesSavedIndicator.textContent = `Salvo em ${new Date().toLocaleTimeString()}`;
  };

  function loadNotesForMe(notesState){
    window.__notes = notesState || window.__notes || {};
    const myNote = window.__notes[socket.id];
    if (myNote) { notesArea.value = myNote.text || ""; notesSavedIndicator.textContent = `Última: ${new Date((myNote.lastEdit||0)).toLocaleString()}`; } else { notesArea.value = ""; notesSavedIndicator.textContent = "—"; }
    if (role === "master") renderMasterNotes(window.__notes || {});
  }

  function renderMasterNotes(allNotes){
    masterNotesWrapper.innerHTML = "";
    if (role !== "master") return;
    const sec = document.createElement("div"); sec.className = "section"; sec.innerHTML = `<h3 style="color:var(--accent);margin-top:0">Notas dos Jogadores</h3><div id="allNotes"></div>`;
    masterNotesWrapper.appendChild(sec);
    const box = sec.querySelector("#allNotes");
    Object.entries(allNotes || {}).forEach(([sid, n]) => {
      const p = players.find(x=>x.id===sid);
      const name = p ? p.username : sid;
      const div = document.createElement("div");
      div.style.borderBottom = "1px solid rgba(255,255,255,0.02)";
      div.style.padding = "6px 0";
      div.innerHTML = `<b>${escapeHtml(name)}</b> <small style="color:#9fbfdc">(${new Date((n.lastEdit||0)).toLocaleString()})</small><div style="margin-top:6px">${escapeHtml(n.text || "(vazio)")}</div>`;
      box.appendChild(div);
    });
  }

  // ---------- Popup & token functions duplicate omitted here for brevity (they remain unchanged) ----------
  // (Everything else left intact — above you have the full script in the project; no functional changes beyond fog/light)

  // ---------- permissions UI ----------
  function enforcePermissionsUI(){
    if (role === "player") {
      document.getElementById("mapSection").style.display = "none";
      document.getElementById("tokenSection").style.display = "none";
      const musicSection = document.getElementById("musicSection");
      musicSection.querySelectorAll("button, #music-list").forEach(el => { if (el.id === "musicVolume" || el.id === "musicLoop") return; try{ el.style.display = "none"; } catch(e){} });
      document.getElementById("chatSection").style.display = "block";
      document.getElementById("notesSection").style.display = "block";
      document.getElementById("fogControls").style.display = "none";
    } else {
      document.getElementById("mapSection").style.display = "block";
      document.getElementById("tokenSection").style.display = "block";
      document.getElementById("musicSection").style.display = "block";
      document.getElementById("fogControls").style.display = "block";
    }
    enforceFogVisibility();
  }

  function enforceFogVisibility(){
    if (role === "player") {
      fogCanvas.style.display = "block"; fogCanvas.style.pointerEvents = "none";
      return;
    }
    if (role === "master") {
      const checked = !!viewAsPlayerChk.checked;
      fogCanvas.style.display = checked ? "block" : "none";
      fogCanvas.style.pointerEvents = checked ? "auto" : "none";
    }
  }

  viewAsPlayerChk.onchange = () => {
    enforceFogVisibility();
    draw();
    redrawFogOverlay();
  };

  // ---------- utilities ----------
  function showToast(msg, ms = 2200){ musicNow.textContent = msg; clearTimeout(showToast._t); showToast._t = setTimeout(()=>{ musicNow.textContent = currentMusicState.filename ? currentMusicState.filename.replace(/^music\//,'') : "(Nenhuma faixa)"; }, ms); }

  // ---------- initial requests ----------
  function initialRequests(){ socket.emit("requestFullState"); socket.emit("requestMaps"); socket.emit("requestMusicList"); }
  setTimeout(initialRequests, 140);

  // ---------- token select quick center ----------
  tokenSelect.addEventListener("change", ()=> {
    const id = tokenSelect.value; const t = tokens.find(x=>x.id==id);
    if (t) { offsetX = mapCanvas.width/2 - (t.x + t.width/2) * scale; offsetY = mapCanvas.height/2 - (t.y + t.height/2) * scale; draw(); redrawFogOverlay(); }
  });

  // ---------- debug expose ----------
  window.__Atrionix = { socket, draw, tokens, players, maps, musicList };

  // ---------- start ----------
  showLoginModal();
  setTimeout(()=>{ resizeCanvas(); }, 120);

})();
/* ---------- Fim do script.js ---------- */
