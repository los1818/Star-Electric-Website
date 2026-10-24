"use client";

import { useEffect, useRef, useState } from "react";
import { ActionForm, FieldError, SubmitButton, TextField, useFormField } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import type { FormAction } from "@/server/actions/authorized-action";

const MAX_EDGE = 2000;

/**
 * Shrink a phone photo to at most 2000px on its long edge as a JPEG before it goes up, so
 * uploads are quick on mobile data. If the browser can't decode it (e.g. HEIC in Chrome),
 * the original goes up and the server stores it as is.
 */
async function shrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.type === "image/jpeg" && file.size < 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function PhotoUploadForm({ action, workOrderId }: { action: FormAction; workOrderId: string }) {
  const [preparing, setPreparing] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const files = Array.from(input.files ?? []);
    if (!files.length || typeof DataTransfer === "undefined") return;
    setPreparing(true);
    try {
      const shrunk = await Promise.all(files.map(shrink));
      const dt = new DataTransfer();
      shrunk.forEach((f) => dt.items.add(f));
      input.files = dt.files;
    } finally {
      setPreparing(false);
    }
  }

  return (
    <ActionForm action={action} className="mt-4">
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <fieldset disabled={preparing} className="space-y-3">
        <div>
          <label htmlFor="wo-photos" className="mb-1 block text-sm font-semibold">Add photos</label>
          <input id="wo-photos" name="photos" type="file" accept="image/*" multiple onChange={onChange} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white" />
          <FieldError name="photos" />
        </div>
        <TextField name="caption" label="Caption (optional)" placeholder="e.g. Panel before the swap" />
        <div className="flex items-center gap-3">
          <SubmitButton variant="dark">Upload</SubmitButton>
          {preparing && <span className="text-sm text-muted">Preparing photos…</span>}
        </div>
      </fieldset>
    </ActionForm>
  );
}

/** Finger or mouse signature box. Writes the drawing as a PNG data URL into a hidden field. */
function SignaturePad({ name }: { name: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  // After a failed save (e.g. no name), keep what was signed rather than asking again.
  const submitted = useFormField(name).defaultValue;
  const [value, setValue] = useState(submitted.startsWith("data:image/png") ? submitted : "");

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111111";
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.clientWidth, canvas.clientHeight);
      img.src = value;
    }
    // Only on mount: later strokes are drawn directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = e.currentTarget.getContext("2d")!;
    const [x, y] = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1); // a tap leaves a dot
    ctx.stroke();
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const [x, y] = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function end(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    setValue(e.currentTarget.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setValue("");
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-semibold">Signature</span>
        <button type="button" onClick={clear} className="text-xs font-semibold underline">Clear</button>
      </div>
      <canvas
        ref={canvasRef}
        aria-label="Signature box: sign here with a finger or mouse"
        className="h-40 w-full touch-none rounded-md border-2 border-dashed border-gray-300 bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <input type="hidden" name={name} value={value} />
      <FieldError name={name} />
    </div>
  );
}

export function SignatureForm({ action, workOrderId, defaultSigner }: { action: FormAction; workOrderId: string; defaultSigner?: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${buttonClass("primary")} mt-4`}>
        Get customer signature
      </button>
    );
  }
  return (
    <ActionForm action={action} className="mt-4 space-y-3">
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <p className="text-sm text-muted">Hand the device to the customer to confirm the work was done.</p>
      <TextField name="signerName" label="Signed by" defaultValue={defaultSigner} required />
      <SignaturePad name="signature" />
      <div className="flex items-center gap-3">
        <SubmitButton>Save signature</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("secondary")}>Cancel</button>
      </div>
    </ActionForm>
  );
}
