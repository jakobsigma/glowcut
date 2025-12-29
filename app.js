/* app.js (non-module, stable) */
console.log("[GlowCut] app.js loaded ✅");

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

let cropper = null;
let currentBlob = null;
let exportBlob = null;

function setStatus(t) {
  if (statusEl) statusEl.textContent = t;
  console.log("[GlowCut]", t);
}

function enableUI(on) {
  const buttons = [btnFit, btnReset, btnCrop, btnRemoveBg, btnDownload, btnClear];
  buttons.forEach((b) => b && (b.disabled = !on));
  document.querySelectorAll("[data-aspect]").forEach((b) => (b.disabled = !on));
  if (btnDownload) btnDownload.disabled = true;
}

function destroyCropper() {
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
}

async function loadImageToCropper(blob) {
  setStatus("Loading image…");
  destroyCropper();

  img.style.display = "block";
  preview.style.display = "none";
  exportBlob = null;

  const url = URL.createObjectURL(blob);

  await new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = url;
  });

  if (typeof Cropper === "undefined") {
    setStatus("CropperJS is not loaded. Check the script tag in index.html.");
    return;
  }

  cropper = new Cropper(img, {
    viewMode: 1,
    dragMode: "move",
    autoCropArea: 0.9,
    responsive: true,
    background: false,
  });

  setStatus("Image shown ✅ Cropper ready.");
}

file.addEventListener("change", async (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;

  currentBlob = f;
  enableUI(true);

  try {
    await loadImageToCropper(f);
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

btnFit.addEventListener("click", () => cropper && cropper.zoomTo(1));
btnReset.addEventListener("click", () => cropper && cropper.reset());

btnCrop.addEventListener("click", async () => {
  if (!cropper) return;

  setStatus("Cropping…");
  const canvas = cropper.getCroppedCanvas({
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "high",
  });

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1.0));
  exportBlob = blob;

  preview.src = URL.createObjectURL(blob);
  preview.style.display = "block";
  btnDownload.disabled = false;

  setStatus("Cropped ✅ Preview updated.");
});

// Background removal disabled for now (so the tool definitely works)
btnRemoveBg.addEventListener("click", () => {
  setStatus("Background removal is disabled in this stable build. We enable it next.");
});

btnDownload.addEventListener("click", () => {
  if (!exportBlob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(exportBlob);
  a.download = "glowcut.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
});

btnClear.addEventListener("click", () => {
  destroyCropper();
  currentBlob = null;
  exportBlob = null;
  img.src = "";
  img.style.display = "none";
  preview.src = "";
  preview.style.display = "none";
  file.value = "";
  enableUI(false);
  setStatus("Waiting for image.");
});

enableUI(false);
setStatus("Waiting for image.");
