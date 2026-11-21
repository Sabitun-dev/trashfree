// Photos live in a private Netlify Blobs store. They are only ever served through the authorised API.
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { orderView } from "../domain/permissions";
import { db } from "./db";
import { bad, forbidden, notFound } from "./errors";
import { enforce } from "./ratelimit";
import { getSettings } from "./settings";
import { sniffImage, stripMetadata } from "./image";
import type { AuthUser } from "./users";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Netlify request limit is ~6 MB; phones send ~1 MB

const store = () => getStore({ name: "photos", consistency: "strong" });

export async function savePhoto(user: AuthUser, file: File, kind: "customer" | "completion") {
  const settings = await getSettings();
  await enforce(`upload:${user.id}`, settings.uploadsPerHour, 3600);
  if (file.size > MAX_UPLOAD_BYTES) throw bad("photo_too_big");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) throw bad("photo_type");
  let clean: Uint8Array;
  try {
    clean = stripMetadata(bytes, type);
  } catch {
    throw bad("photo_type");
  }
  const ext = type.split("/")[1];
  const key = `${kind}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
  await store().set(key, clean.slice().buffer as ArrayBuffer, { metadata: { type } });
  return db().orderPhoto.create({ data: { uploaderId: user.id, kind, blobKey: key, mime: type, size: clean.length } });
}

export async function readPhoto(user: AuthUser, id: string) {
  const photo = await db().orderPhoto.findUnique({ where: { id }, include: { order: true } });
  if (!photo) throw notFound();
  const own = photo.uploaderId === user.id;
  const canSee = own || (photo.order && orderView(user, photo.order) !== "none");
  if (!canSee) throw forbidden();
  const data = await store().get(photo.blobKey, { type: "arrayBuffer" });
  if (!data) throw notFound();
  return { data, mime: photo.mime };
}

export async function deletePhotoBlob(key: string) {
  await store().delete(key);
}
