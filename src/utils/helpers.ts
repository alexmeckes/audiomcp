import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";

export function generateId(): string {
  return crypto.randomBytes(8).toString("hex");
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

export function getExtension(format: string): string {
  const extensions: Record<string, string> = {
    mp3: ".mp3",
    wav: ".wav",
    ogg: ".ogg",
    flac: ".flac",
  };
  return extensions[format] || ".mp3";
}

export async function listFiles(
  dirPath: string,
  extensions: string[] = [".mp3", ".wav", ".ogg"]
): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await listFiles(fullPath, extensions)));
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }

    return files;
  } catch {
    return [];
  }
}
