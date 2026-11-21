// Compress photos on the phone: max 1600 px, ~1 MB JPEG. Re-encoding also drops EXIF (incl. GPS).

const MAX_SIDE = 1600;
const TARGET_BYTES = 1_000_000;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      res(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rej(new Error("photo_type"));
    };
    img.src = url;
  });
}

const toBlob = (c: HTMLCanvasElement, q: number) => new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", q));

export async function compressImage(file: File): Promise<Blob> {
  if (!/^image\//.test(file.type) && file.type !== "") throw new Error("photo_type");
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("photo_type");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  for (const q of [0.82, 0.72, 0.6, 0.5]) {
    const blob = await toBlob(canvas, q);
    if (blob && (blob.size <= TARGET_BYTES || q === 0.5)) return blob;
  }
  throw new Error("photo_type");
}
