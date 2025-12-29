// Background removal (ESM). This import works on GitHub Pages via jsDelivr ESM wrapper.
import removeBackground from "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm";

const $ = (id) => document.getElementById(id);

const file = $("file");
const img = $("image");
const stage = $("stage");

const preview = $("preview");
const statusEl = $("status");

const btnFit = $("fit");
const btnReset = $("reset");
const btnCrop = $("crop");
const btnRmBg = $("rmbg");
const btnDownload = $("download");
const btnClear = $("clear");

const pad = $("pad");
const shadow = $("shadow");
const glow = $("glow");

let cropper = null;

// Pipeline:
// baseBlob = current editable blob (original/cropped/bg-removed)
// exportBlob = stylized PNG that user downloads
let baseBlob = null;
let exportBlob = null;

function setStatus(text) {
  statusEl.textContent = text;
}

function setUIEnabled(enabled) {
  [btnFit, btnReset, btnCrop, btnRmBg, btnDownload, btnClear].forEach((b) => (b.disabled = !enabled));
  document.querySelectorAll("[data-aspect]").forEach((b) => (b.disabled = !enabled));
  btnDownload.disabled = true; // enabled only after we render an export
}

function destroyCropper() {
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
}

// Ensures layout is computed (prevents 0x0 cropper issues)
function forceLayout() {
  stage.getBoundingClientRect();
  img.getBoundingClientRect();
}

// Load a blob into the main image, then init Cropper AFTER the image is fully loaded
async function loadBlobIntoEditor(blob) {
  setStatus("Loading image…");
  destroyCropper();

  img.style.display = "block";
  preview.style.display = "none";
  exportBlob = null;
  btnDownload.disabled = true;

  const url = URL.createObjectURL(blob);

  await new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = url;
  });

  forceLayout();

  if (typeof Cropper === "undefined") {
    setStatus("CropperJS failed to load. Check the Cropper script tag.");
    return;
  }

  cropper = new Cropper(img, {
    viewMode: 1,
    dragMode: "move",
    autoCropArea: 0.9,
    responsive: true,
    background: false
  });

  setStatus("Ready.");
}

// Stylize for export (padding + shadow + glow)
async function stylizeToPng(blob) {
  const p = Number(pad.value);
  const s = Number(shadow.value);
  const g = Number(glow.value);

  const bm = await createImageBitmap(blob);

  const c = document.createElement("canvas");
  c.width = bm.width + p * 2;
  c.height = bm.height + p * 2;
  const ctx = c.getContext("2d");

  // Shadow
  if (s > 0) {
    ctx.save();
    ctx.shadowBlur = s;
    ctx.shadowColor = "rgba(0,0,0,.55)";
    ctx.drawImage(bm, p, p);
    ctx.restore();
  }

  // Glow passes
  if (g > 0) {
    ctx.save();
    ctx.shadowBlur = g;
    ctx.shadowColor = "rgba(124,92,255,.55)";
    ctx.drawImage(bm, p, p);
    ctx.shadowColor = "rgba(0,217,255,.45)";
    ctx.drawImage(bm, p, p);
    ctx.shadowColor = "rgba(0,255,154,.30)";
    ctx.drawImage(bm, p, p);
    ctx.restore();
  }

  // Main image
  ctx.drawImage(bm, p, p);

  return await new Promise((resolve) => c.toBlob(resolve, "image/png", 1.0));
}

async function renderPreviewFromBase() {
  if (!baseBlob) return;
  const out = await stylizeToPng(baseBlob);
  exportBlob = out;

  preview.src = URL.createObjectURL(out);
  preview.style.display = "block";
  btnDownload.disabled = false;
}

// Upload
file.addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;

  baseBlob = f;
  setUIEnabled(true);

  try {
    await loadBlobIntoEditor(baseBlob);
    await renderPreviewFromBase();
  } catch (err) {
    console.error(err);
    setStatus("Failed to load image. Try another file.");
  }
});

// Aspect ratio buttons
document.querySelectorAll("[data-aspect]").forEach((b) => {
  b.addEventListener("click", () => {
    if (!cropper) return;
    const v = b.dataset.aspect;
    cropper.setAspectRatio(v === "free" ? NaN : Number(v));
  });
});

btnFit.addEventListener("click", () => cropper?.zoomTo(1));
btnReset.addEventListener("click", () => cropper?.reset());

// Crop action
btnCrop.addEventListener("click", async () => {
  if (!cropper) return;

  setStatus("Cropping…");
  const canvas = cropper.getCroppedCanvas({
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "high"
  });

  const cropped = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1.0));
  baseBlob = cropped;

  await loadBlobIntoEditor(baseBlob);
  await renderPreviewFromBase();
  setStatus("Cropped.");
});

// Remove background action
btnRmBg.addEventListener("click", async () => {
  if (!baseBlob) return;

  setStatus("Removing background…");
  btnRmBg.disabled = true;

  try {
    // Required so the library can fetch its wasm/models.
    const config = {
      publicPath: "https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/",
      output: { format: "image/png" }
    };

    const out = await removeBackground(baseBlob, config);
    baseBlob = out;

    await loadBlobIntoEditor(baseBlob);
    await renderPreviewFromBase();
    setStatus("Background removed.");
  } catch (err) {
    console.error(err);
    setStatus("Background removal failed. Try a smaller/clearer image.");
  } finally {
    btnRmBg.disabled = false;
  }
});

// Restyle when sliders change
[pad, shadow, glow].forEach((r) => {
  r.addEventListener("input", async () => {
    await renderPreviewFromBase();
  });
});

// Download
btnDownload.addEventListener("click", () => {
  if (!exportBlob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(exportBlob);
  a.download = "glowcut.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
});

// Clear
btnClear.addEventListener("click", () => {
  destroyCropper();
  baseBlob = null;
  exportBlob = null;

  img.src = "";
  img.style.display = "none";

  preview.src = "";
  preview.style.display = "none";

  file.value = "";
  setUIEnabled(false);
  setStatus("Waiting for image.");
});

// Init
setUIEnabled(false);
setStatus("Waiting for image.");
