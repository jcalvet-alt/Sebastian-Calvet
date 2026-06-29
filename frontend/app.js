/**
 * App de conteo de hacienda — frontend JavaScript
 * Maneja: carga de imagen, llamada al backend, dibujado de cajas,
 * corrección manual y exportación de resultados.
 */

const API_BASE = "http://localhost:8000";

// ---- Estado global ----
const state = {
  imageFile: null,       // File original
  imageBitmap: null,     // ImageBitmap para dibujar
  detections: [],        // [{bbox, score, class, manual?}]
  countOverride: null,   // Si el usuario editó el total a mano
  activeTool: "none",    // "none" | "add" | "remove"
  // escala para traducir coords canvas ↔ imagen original
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

// ---- Referencias DOM ----
const dropZone    = document.getElementById("drop-zone");
const fileInput   = document.getElementById("file-input");
const canvas      = document.getElementById("main-canvas");
const ctx         = canvas.getContext("2d");
const detectBtn   = document.getElementById("detect-btn");
const confSlider  = document.getElementById("conf-slider");
const confVal     = document.getElementById("conf-val");
const overlapSlider = document.getElementById("overlap-slider");
const overlapVal  = document.getElementById("overlap-val");
const tileSelect  = document.getElementById("tile-size");
const resultsCard = document.getElementById("results-card");
const countNumber = document.getElementById("count-number");
const countOverrideInput = document.getElementById("count-override");
const applyOverrideBtn   = document.getElementById("apply-override");
const metaInfo    = document.getElementById("meta-info");
const progressWrap = document.getElementById("progress-bar-wrap");
const progressLabel = document.getElementById("progress-label");
const placeholder = document.getElementById("placeholder-msg");
const modelBadge  = document.getElementById("model-badge");
const toolHint    = document.getElementById("tool-hint");
const exportBtn   = document.getElementById("export-btn");

// ---- Colores de cajas ----
const BOX_COLOR   = "#00e676";   // verde brillante — detecciones automáticas
const MANUAL_ADD  = "#ffeb3b";   // amarillo — agregadas a mano
const REMOVE_COLOR = "#ef5350";  // rojo — marcadas para quitar (no se dibujan)

// ================================================================== //
//  Drag & drop + selección de archivo                                 //
// ================================================================== //

dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", e => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", e => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) loadImage(file);
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) loadImage(fileInput.files[0]);
});

async function loadImage(file) {
  const allowed = ["image/jpeg", "image/png", "image/tiff", "image/webp"];
  if (!allowed.includes(file.type)) {
    showToast("Formato no soportado. Usá JPG, PNG o TIFF.", "error");
    return;
  }
  state.imageFile = file;
  state.detections = [];
  state.countOverride = null;
  resultsCard.style.display = "none";

  const blob = URL.createObjectURL(file);
  state.imageBitmap = await createImageBitmap(await fetch(blob).then(r => r.blob()));
  URL.revokeObjectURL(blob);

  renderCanvas();
  detectBtn.disabled = false;
  placeholder.style.display = "none";
  canvas.style.display = "block";
}

// ================================================================== //
//  Sliders                                                            //
// ================================================================== //

confSlider.addEventListener("input", () => {
  confVal.textContent = confSlider.value;
});

overlapSlider.addEventListener("input", () => {
  overlapVal.textContent = Math.round(overlapSlider.value * 100) + "%";
});

// ================================================================== //
//  Detección                                                          //
// ================================================================== //

detectBtn.addEventListener("click", runDetection);

async function runDetection() {
  if (!state.imageFile) return;

  detectBtn.disabled = true;
  showProgress("Enviando imagen al backend…");

  const form = new FormData();
  form.append("file", state.imageFile);
  form.append("conf_threshold", confSlider.value);
  form.append("tile_size", tileSelect.value);
  form.append("overlap", overlapSlider.value);

  try {
    showProgress("Procesando (puede tardar en imágenes grandes)…");
    const res = await fetch(`${API_BASE}/detect`, { method: "POST", body: form });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || `Error ${res.status}`);
    }
    const data = await res.json();
    hideProgress();
    applyResults(data);
  } catch (e) {
    hideProgress();
    detectBtn.disabled = false;
    showToast(e.message, "error");
  }
}

function applyResults(data) {
  state.detections = data.detections.map(d => ({ ...d, removed: false, manual: false }));
  state.countOverride = null;
  countOverrideInput.value = "";

  const visible = state.detections.filter(d => !d.removed).length;
  countNumber.textContent = visible;

  metaInfo.innerHTML = `
    Imagen: ${data.image_size.width}×${data.image_size.height} px<br>
    Tiles procesados: ${data.tiles_used}<br>
    Tiempo: ${data.processing_time_sec}s<br>
    ${data.model_is_placeholder ? "⚠️ Modelo placeholder COCO (clase 'cow')" : "✅ Modelo propio"}
  `;

  resultsCard.style.display = "block";
  renderCanvas();
  detectBtn.disabled = false;
}

// ================================================================== //
//  Canvas — dibujo                                                    //
// ================================================================== //

function renderCanvas() {
  if (!state.imageBitmap) return;

  const wrapper = document.getElementById("canvas-wrapper");
  const maxW = wrapper.clientWidth;
  const maxH = wrapper.clientHeight;

  const imgW = state.imageBitmap.width;
  const imgH = state.imageBitmap.height;

  const scale = Math.min(maxW / imgW, maxH / imgH, 1);
  const dispW = Math.round(imgW * scale);
  const dispH = Math.round(imgH * scale);

  canvas.width  = dispW;
  canvas.height = dispH;

  state.scale   = scale;
  state.offsetX = 0;
  state.offsetY = 0;

  ctx.drawImage(state.imageBitmap, 0, 0, dispW, dispH);
  drawBoxes(scale);
}

function drawBoxes(scale) {
  const lineW = Math.max(1.5, 2 / scale);
  const fontSize = Math.max(10, 13 / scale);

  for (const det of state.detections) {
    if (det.removed) continue;

    const [x1, y1, x2, y2] = det.bbox.map(v => v * scale);
    const color = det.manual ? MANUAL_ADD : BOX_COLOR;

    ctx.strokeStyle = color;
    ctx.lineWidth   = lineW;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

    // Etiqueta de score
    if (!det.manual) {
      const label = (det.score * 100).toFixed(0) + "%";
      ctx.font = `bold ${fontSize}px sans-serif`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = color;
      ctx.fillRect(x1, y1 - fontSize - 4, tw + 6, fontSize + 4);
      ctx.fillStyle = "#000";
      ctx.fillText(label, x1 + 3, y1 - 3);
    }
  }
}

// ================================================================== //
//  Interacción con el canvas (corrección manual)                     //
// ================================================================== //

// Herramientas
document.getElementById("tool-buttons").addEventListener("click", e => {
  const btn = e.target.closest(".tool-btn");
  if (!btn) return;
  const tool = btn.dataset.tool;
  setTool(tool);
});

function setTool(tool) {
  state.activeTool = tool;
  document.querySelectorAll(".tool-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.tool === tool);
  });
  const hints = {
    none: "",
    add:  "Hacé clic donde está el animal para agregar una marca.",
    remove: "Hacé clic sobre una caja para quitarla.",
  };
  toolHint.textContent = hints[tool] || "";
  canvas.style.cursor = tool === "none" ? "default" : "crosshair";
}

canvas.addEventListener("click", e => {
  if (state.activeTool === "none") return;
  if (!state.imageBitmap) return;

  const rect = canvas.getBoundingClientRect();
  // Coordenadas en píxeles del canvas
  const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const cy = (e.clientY - rect.top)  * (canvas.height / rect.height);

  // Coordenadas en la imagen original
  const ix = cx / state.scale;
  const iy = cy / state.scale;

  if (state.activeTool === "add") {
    addDetection(ix, iy);
  } else if (state.activeTool === "remove") {
    removeDetection(ix, iy);
  }
});

function addDetection(ix, iy) {
  // Caja manual centrada en el clic, tamaño estimado típico de un bovino desde dron
  const boxSize = 30; // píxeles en la imagen original; ajustá si querés
  state.detections.push({
    bbox: [ix - boxSize/2, iy - boxSize/2, ix + boxSize/2, iy + boxSize/2],
    score: 1.0,
    class: -1,
    removed: false,
    manual: true,
  });
  updateCount();
  renderCanvas();
  showToast("Animal agregado.");
}

function removeDetection(ix, iy) {
  // Busca la caja más cercana al clic
  let best = null;
  let bestDist = Infinity;

  for (const det of state.detections) {
    if (det.removed) continue;
    const [x1, y1, x2, y2] = det.bbox;
    // Distancia al centro de la caja
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const dist = Math.hypot(ix - cx, iy - cy);
    // También verificar que el clic esté dentro o muy cerca
    const inside = ix >= x1 - 20 && ix <= x2 + 20 && iy >= y1 - 20 && iy <= y2 + 20;
    if (inside && dist < bestDist) {
      bestDist = dist;
      best = det;
    }
  }

  if (best) {
    best.removed = true;
    updateCount();
    renderCanvas();
    showToast("Detección eliminada.");
  } else {
    showToast("No hay ninguna caja en ese punto.", "error");
  }
}

// ================================================================== //
//  Conteo y override                                                  //
// ================================================================== //

function updateCount() {
  const visible = state.detections.filter(d => !d.removed).length;
  state.countOverride = null;
  countNumber.textContent = visible;
  countOverrideInput.value = "";
}

applyOverrideBtn.addEventListener("click", () => {
  const v = parseInt(countOverrideInput.value, 10);
  if (isNaN(v) || v < 0) {
    showToast("Ingresá un número válido.", "error");
    return;
  }
  state.countOverride = v;
  countNumber.textContent = v;
  showToast(`Total actualizado a ${v}.`);
});

// ================================================================== //
//  Exportar JSON                                                       //
// ================================================================== //

exportBtn.addEventListener("click", () => {
  const visible = state.detections.filter(d => !d.removed);
  const output = {
    archivo: state.imageFile?.name || "desconocido",
    fecha: new Date().toISOString(),
    total: state.countOverride ?? visible.length,
    total_automatico: state.detections.filter(d => !d.removed && !d.manual).length,
    agregados_manual: state.detections.filter(d => !d.removed && d.manual).length,
    eliminados_manual: state.detections.filter(d => d.removed).length,
    detecciones: visible.map(d => ({
      bbox: d.bbox,
      score: d.score,
      manual: d.manual,
    })),
  };

  const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `conteo_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// ================================================================== //
//  UI helpers                                                          //
// ================================================================== //

function showProgress(msg) {
  progressLabel.textContent = msg;
  progressWrap.style.display = "flex";
}
function hideProgress() {
  progressWrap.style.display = "none";
}

let toastTimer;
function showToast(msg, type = "info") {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.className = "toast show" + (type === "error" ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

// ================================================================== //
//  Verificar estado del backend al cargar                            //
// ================================================================== //

(async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (data.model_is_placeholder) {
      modelBadge.textContent = "Modelo placeholder COCO";
      modelBadge.style.background = "rgba(255,160,0,.6)";
    } else {
      modelBadge.textContent = "Modelo propio cargado";
    }
  } catch {
    modelBadge.textContent = "Backend no disponible";
    modelBadge.style.background = "rgba(198,40,40,.6)";
    showToast("No se pudo conectar al backend. ¿Está corriendo en puerto 8000?", "error");
  }
})();

// Redibujar si cambia el tamaño de la ventana
window.addEventListener("resize", () => {
  if (state.imageBitmap) renderCanvas();
});
