import { convertFileSrc, invoke } from "@tauri-apps/api/core";

export interface SavedPastedImage {
  path: string;
  previewUrl: string;
}

export function localImagePathToPreviewUrl(path: string): string {
  return convertFileSrc(path);
}

export async function savePastedImageFile(
  file: File,
): Promise<SavedPastedImage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const dataBase64 = bytesToBase64(bytes);
  const path = await invoke<string>("save_pasted_conversation_image", {
    mime: file.type || inferImageMime(file.name),
    dataBase64,
  });
  return {
    path,
    previewUrl: convertFileSrc(path),
  };
}

function inferImageMime(name: string): string {
  const ext = name.trim().toLowerCase().split(".").pop();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
