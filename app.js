import { removeBackground } from "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.6.2/dist/browser/index.js";

const el = (id) => document.getElementById(id);

const file = el("file");
const img = el("image");
const preview = el("preview");
const statusEl = el("status");

const btnFit = el("btnFit");
const btnReset = el("btnReset");
const btnCrop = el("btnCrop");
const btnRemoveBg = el("btnRemoveBg");
const btnDownload = el("btnDownload");
const btnClear = el("btnClear");

const pad = el("pad");
const shadow = el("shadow");
const glow = el("glow");

let cropper = null;
let workingBlob = null; // current output (cropped/bg-removed/etc)

function setStatus(text){ statusEl.textContent = text; }

function enableAll(on){
  for (const b of [btnFit, btnReset, btnCrop, btnRemoveBg, btnDownload, btnClear]) {
    b.disabled = !on;
  }
  document.querySelectorAll("[data-aspect]").forEach(b => b.disabled = !on);
}

function destroyCropper(){
  if (cropper) { cropper.destroy(); cropper = null; }
}

function showImageForCropping(url){
  img.src = url;
  img.style.display = "block";

  destroyCropper();
  cropper = new Cropper(img, {
    viewMode: 1,
    dragMode: "move",
    autoCropArea: 0.9,
    responsive: true,
    background: false
  });

  setStatus("Image loaded. You can crop or remove background.");
}

function showPreviewFromBlob(blob){
  workingBlob = blob;
  const url = URL.createObjectURL(blob);
  preview.src = url;
  preview.style.display = "block";
  btnDownload.disabled = false;
}

function canvasFromImageBitmap(bm){
  const c = document.createElement("canvas");
  c.width = bm.width;
  c.height = bm.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(bm, 0, 0);
  return c;
}

// Adds optional padding + glow/shadow to a transparent PNG-ish result
async function stylizeBlob(blob){
  const p = Number(pad.value);
  const s = Number(shadow.value);
  const g = Number(glow.value);

  const bm = await createImageBitmap(blob);
  const w = bm.width, h = bm.height;

  const c = document.createElement("canvas");
  c.width = w + p*2;
  c.height = h + p*2;
  const ctx = c.getContext("2d");

  // shadow (subtle)
  if (s > 0){
    ctx.save();
    ctx.shadowBlur = s;
    ctx.shadowColor = "rgba(0,0,0,.55)";
    ctx.drawImage(bm, p, p);
    ctx.restore();
  }

  // glow (neon-ish)
  if (g > 0){
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.shadowBlur = g;
    ctx.shadowColor = "rgba(124,92,255,.55)";
    ctx.drawImage(bm, p, p);
    ctx.shadowColor = "rgba(0,217,255,.45)";
    ctx.drawImage(bm, p, p);
    ctx.shadowColor = "rgba(0,255,154,.30)";
    ctx.drawImage(bm, p, p);
    ctx.restore();
  }

  // main image on top
  ctx.drawImage(bm, p, p);

  return await new Promise((resolve) => c.toBlob(resolve, "image/png", 1.0));
}

// Upload
file.addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;

  setStatus("Loading image...");
  enableAll(true);
  btnDownload.disabled = true;
  preview.style.display = "none";

  const url = URL.createObjectURL(f);
  showImageForCropping(url);
  workingBlob = f;
});

// Aspect buttons
document.querySelectorAll("[data-aspect]").forEach((b) => {
  b.addEventListener("click", () => {
    if (!cropper) return;
    const v = b.dataset.aspect;
    cropper.setAspectRatio(v === "free" ? NaN : Number(v));
  });
});

// Fit / Reset
btnFit.addEventListener("click", () => cropper?.zoomTo(1));
btnReset.addEventListener("click", () => cropper?.reset());

// Crop
btnCrop.addEventListener("click", async () => {
  if (!cropper) return;
  setStatus("Cropping...");
  const canvas = cropper.getCroppedCanvas({ imageSmoothingEnabled: true, imageSmoothingQuality: "high" });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1.0));
  const styled = await stylizeBlob(blob);
  showPreviewFromBlob(styled);
  setStatus("Cropped. Preview updated.");
});

// Remove background
btnRemoveBg.addEventListener("click", async () => {
  if (!workingBlob) return;

  setStatus("Removing background (in-browser AI)…");
  btnRemoveBg.disabled = true;

  try{
    // Use the most recent visual (cropped or original)
    const inputBlob = preview.style.display === "block" ? workingBlob : workingBlob;

    const outBlob = await removeBackground(inputBlob, {
      // good defaults; keep it simple for GitHub Pages
      output: { format: "image/png" }
    });

    const styled = await stylizeBlob(outBlob);
    showPreviewFromBlob(styled);
    setStatus("Background removed. Preview updated.");
  }catch(err){
    console.error(err);
    setStatus("Background removal failed. Try a different image or smaller file.");
  }finally{
    btnRemoveBg.disabled = false;
  }
});

// Re-stylize when sliders change (if preview exists)
[pad, shadow, glow].forEach((r) => {
  r.addEventListener("input", async () => {
    if (!workingBlob || preview.style.display !== "block") return;
    // Re-run stylize on the last *raw* blob is ideal, but for simplicity we stylize current blob again
    // If you want “true” non-destructive styling, store rawBlob separately.
  });
});

// Download
btnDownload.addEventListener("click", () => {
  if (!workingBlob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(workingBlob);
  a.download = "glowcut.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
});

// Clear
btnClear.addEventListener("click", () => {
  destroyCropper();
  img.src = "";
  img.style.display = "none";
  preview.src = "";
  preview.style.display = "none";
  workingBlob = null;
  enableAll(false);
  file.value = "";
  setStatus("Waiting for image.");
});

// Initial state
enableAll(false);
