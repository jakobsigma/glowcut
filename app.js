import { removeBackground } from "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.6.2/dist/browser/index.js";

const $ = (id) => document.getElementById(id);

const file = $("file");
const img = $("image");
const preview = $("preview");
const statusEl = $("status");

const btnFit = $("btnFit");
const btnReset = $("btnReset");
const btnCrop = $("btnCrop");
const btnRemoveBg = $("btnRemoveBg");
const btnDownload = $("btnDownload");
const btnClear = $("btnClear");

const pad = $("pad");
const shadow = $("shadow");
const glow = $("glow");

let cropper = null;

// We keep a clean pipeline:
// originalBlob -> (optional) croppedBlob -> (optional) bgRemovedBlob -> styledBlob(export)
let originalBlob = null;
let currentBlob = null;   // the “working” image (cropped/bg removed), NOT stylized
let styledBlob = null;    // what you download / preview

function setStatus(t) {
  statusEl.textContent = t;
}

function setEnabled(enabled) {
  const buttons = [btnFit, btnReset, btnCrop, btnRemoveBg, btnDownload, btnClear];
  for (const b of buttons) b.disabled = !enabled;
  document.querySelectorAll("[data-aspect]").forEach((b) => (b.disabled = !enabled));
  if (enabled) btnDownload.disabled = true; // only enable after we have a preview/export
}

function destroyCropper() {
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
}

// Stable in-browser styling export (padding + glow + shadow)
async function stylize(blob) {
  const p = Number(pad.value);
  const s = Number(shadow.value);
  const g = Number(glow.value);

  const bm = await createImageBitmap(blob);

  const out = document.createElement("canvas");
  out.width = bm.width + p * 2;
  out.height = bm.height + p * 2;

  const ctx = out.getContext("2d");

  // Shadow pass
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

  return await new Promise((resolve) => out.toBlob(resolve, "image/png", 1.0));
}

function showPreview(blob) {
  styledBlob = blob;
  preview.src = URL.createObjectURL(blob);
  preview.style.display = "block";
  btnDownload.disabled = false;
}

function ensureStageSize() {
  // Cropper sometimes calculates 0x0 if the image container has no layout yet.
  // Force a repaint.
  img.style.display = "block";
  img.getBoundingClientRect();
}

// Load image into Cropper safely
async function loadIntoCropper(blob) {
  setStatus("Loading image…");
  destroyCropper();

  // Reset preview/export
  preview.style.display = "none";
  preview.src = "";
  styledBlob = null;
  btnDownload.disabled = true;

  const url = URL.createObjectURL(blob);

  // Wait for real load
  await new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = url;
  });

  ensureStageSize();

  cropper = new Cropper(img, {
    viewMode: 1,
    dragMode: "move",
    autoCropArea: 0.9,
    responsive: true,
    background: false,
  });

  setStatus("Image loaded. Crop or remove background.");
}

async function setWorkingBlob(blob) {
  currentBlob = blob;

  // Also refresh preview/export with styling
  const styled = await stylize(blob);
  showPreview(styled);
}

file.addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;

  originalBlob = f;
  currentBlob = f;
  styledBlob = null;

  setEnabled(true);

  try {
    await loadIntoCropper(f);
    setStatus("Image loaded. Ready.");
  } catch (err) {
    console.error(err);
    setStatus("Could not display this image. Try another file.");
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

// Crop -> update working blob -> preview
btnCrop.addEventListener("click", async () => {
  if (!cropper) return;

  setStatus("Cropping…");

  const canvas = cropper.getCroppedCanvas({
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "high",
  });

  const cropped = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1.0));

  await setWorkingBlob(cropped);

  // Reload cropper to match the newly cropped image (so next crop is based on cropped)
  try {
    await loadIntoCropper(cropped);
  } catch (err) {
    console.error(err);
  }

  setStatus("Cropped. Preview updated.");
});

// Remove background -> update working blob -> preview
btnRemoveBg.addEventListener("click", async () => {
  if (!currentBlob) return;

  setStatus("Removing background (in-browser)…");
  btnRemoveBg.disabled = true;

  try {
    const outBlob = await removeBackground(currentBlob, {
      output: { format: "image/png" },
    });

    await setWorkingBlob(outBlob);

    // Reload cropper to allow further cropping after bg removal
    try {
      await loadIntoCropper(outBlob);
    } catch (err) {
      console.error(err);
    }

    setStatus("Background removed. Preview updated.");
  } catch (err) {
    console.error(err);
    setStatus("Background removal failed. Try a smaller or clearer image.");
  } finally {
    btnRemoveBg.disabled = false;
  }
});

// Re-style preview when sliders change (non-destructive)
async function restyleIfPossible() {
  if (!currentBlob) return;
  const styled = await stylize(currentBlob);
  showPreview(styled);
}
[pad, shadow, glow].forEach((r) => r.addEventListener("input", restyleIfPossible));

// Download the styled export
btnDownload.addEventListener("click", () => {
  if (!styledBlob) return;

  const a = document.createElement("a");
  a.href = URL.createObjectURL(styledBlob);
  a.download = "glowcut.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
});

// Clear everything
btnClear.addEventListener("click", () => {
  destroyCropper();

  originalBlob = null;
  currentBlob = null;
  styledBlob = null;

  img.src = "";
  img.style.display = "none";

  preview.src = "";
  preview.style.display = "none";

  file.value = "";
  setEnabled(false);
  setStatus("Waiting for image.");
});

// Initial state
setEnabled(false);
setStatus("Waiting for image.");
