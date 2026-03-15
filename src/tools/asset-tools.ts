/**
 * Asset management tools for organizing generated audio
 */

import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { ToolHandler, ServerState, AudioAsset } from "../types.js";
import { listFiles } from "../utils/helpers.js";

// In-memory asset registry (in production, this would be persisted)
const assetRegistry: Map<string, AudioAsset> = new Map();

export function registerAssetTools(
  tools: Map<string, ToolHandler>,
  state: ServerState
): void {
  // List generated assets
  tools.set("list_audio_assets", {
    description:
      "List all generated audio assets, optionally filtered by type or tags.",
    inputSchema: z.object({
      type: z
        .enum(["sfx", "music", "voice", "all"])
        .optional()
        .describe("Filter by asset type (default: all)"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Filter by tags (assets must have all specified tags)"),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of assets to return (default: 50)"),
    }),
    handler: async (args) => {
      const { type, tags, limit = 50 } = args as {
        type?: "sfx" | "music" | "voice" | "all";
        tags?: string[];
        limit?: number;
      };

      let assets = Array.from(assetRegistry.values());

      // Filter by type
      if (type && type !== "all") {
        assets = assets.filter((a) => a.type === type);
      }

      // Filter by tags
      if (tags && tags.length > 0) {
        assets = assets.filter((a) =>
          tags.every((tag) => a.tags.includes(tag))
        );
      }

      // Sort by creation date (newest first)
      assets.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // Apply limit
      assets = assets.slice(0, limit);

      return {
        count: assets.length,
        assets: assets.map((a) => ({
          id: a.id,
          type: a.type,
          name: a.name,
          filePath: a.filePath,
          durationMs: a.durationMs,
          provider: a.provider,
          tags: a.tags,
          createdAt: a.createdAt,
        })),
      };
    },
  });

  // Get asset details
  tools.set("get_audio_asset", {
    description: "Get detailed information about a specific audio asset by ID.",
    inputSchema: z.object({
      id: z.string().describe("The asset ID"),
    }),
    handler: async (args) => {
      const { id } = args as { id: string };

      const asset = assetRegistry.get(id);
      if (!asset) {
        return { success: false, error: `Asset not found: ${id}` };
      }

      // Check if file still exists
      let fileExists = false;
      try {
        await fs.access(asset.filePath);
        fileExists = true;
      } catch {
        fileExists = false;
      }

      return {
        success: true,
        asset: {
          ...asset,
          fileExists,
        },
      };
    },
  });

  // Delete asset
  tools.set("delete_audio_asset", {
    description: "Delete a generated audio asset by ID.",
    inputSchema: z.object({
      id: z.string().describe("The asset ID to delete"),
      delete_file: z
        .boolean()
        .optional()
        .describe("Also delete the audio file (default: true)"),
    }),
    handler: async (args) => {
      const { id, delete_file = true } = args as {
        id: string;
        delete_file?: boolean;
      };

      const asset = assetRegistry.get(id);
      if (!asset) {
        return { success: false, error: `Asset not found: ${id}` };
      }

      if (delete_file) {
        try {
          await fs.unlink(asset.filePath);
        } catch {
          // File might already be deleted
        }
      }

      assetRegistry.delete(id);

      return { success: true, deleted: id };
    },
  });

  // Scan directory for audio files
  tools.set("scan_audio_directory", {
    description:
      "Scan a directory for audio files and add them to the asset registry.",
    inputSchema: z.object({
      directory: z
        .string()
        .optional()
        .describe("Directory to scan (default: output directory)"),
    }),
    handler: async (args) => {
      const { directory } = args as { directory?: string };
      const scanPath = directory || state.outputPath;

      const files = await listFiles(scanPath);
      const added: string[] = [];

      for (const filePath of files) {
        const filename = path.basename(filePath);
        const ext = path.extname(filename).slice(1);

        // Determine type from path or filename
        let type: "sfx" | "music" | "voice" = "sfx";
        if (filePath.includes("/music/") || filename.startsWith("music_")) {
          type = "music";
        } else if (
          filePath.includes("/voice/") ||
          filename.startsWith("voice_")
        ) {
          type = "voice";
        }

        // Generate ID from filename
        const id = filename.replace(/\.[^/.]+$/, "");

        if (!assetRegistry.has(id)) {
          const stat = await fs.stat(filePath);
          const asset: AudioAsset = {
            id,
            type,
            name: filename,
            filePath,
            format: ext,
            durationMs: 0, // Unknown without parsing
            sampleRate: 44100,
            provider: "unknown",
            prompt: "",
            tags: [type],
            createdAt: stat.mtime.toISOString(),
          };

          assetRegistry.set(id, asset);
          added.push(id);
        }
      }

      return {
        success: true,
        scanned: scanPath,
        filesFound: files.length,
        assetsAdded: added.length,
        addedIds: added,
      };
    },
  });

  // Tag an asset
  tools.set("tag_audio_asset", {
    description: "Add or remove tags from an audio asset.",
    inputSchema: z.object({
      id: z.string().describe("The asset ID"),
      add_tags: z
        .array(z.string())
        .optional()
        .describe("Tags to add"),
      remove_tags: z
        .array(z.string())
        .optional()
        .describe("Tags to remove"),
    }),
    handler: async (args) => {
      const { id, add_tags, remove_tags } = args as {
        id: string;
        add_tags?: string[];
        remove_tags?: string[];
      };

      const asset = assetRegistry.get(id);
      if (!asset) {
        return { success: false, error: `Asset not found: ${id}` };
      }

      if (add_tags) {
        for (const tag of add_tags) {
          if (!asset.tags.includes(tag)) {
            asset.tags.push(tag);
          }
        }
      }

      if (remove_tags) {
        asset.tags = asset.tags.filter((t) => !remove_tags.includes(t));
      }

      return {
        success: true,
        id,
        tags: asset.tags,
      };
    },
  });

  // Export asset for game engine
  tools.set("export_audio_for_engine", {
    description:
      "Export an audio asset in a format optimized for a specific game engine.",
    inputSchema: z.object({
      id: z.string().describe("The asset ID to export"),
      engine: z
        .enum(["godot", "unity", "unreal", "generic"])
        .describe("Target game engine"),
      output_directory: z
        .string()
        .optional()
        .describe("Output directory (default: engine-appropriate location)"),
    }),
    handler: async (args) => {
      const { id, engine, output_directory } = args as {
        id: string;
        engine: "godot" | "unity" | "unreal" | "generic";
        output_directory?: string;
      };

      const asset = assetRegistry.get(id);
      if (!asset) {
        return { success: false, error: `Asset not found: ${id}` };
      }

      // Determine output path based on engine conventions
      let targetDir: string;
      let targetFormat = asset.format;

      switch (engine) {
        case "godot":
          targetDir = output_directory || "res://audio";
          // Godot prefers OGG for music, WAV for short SFX
          if (asset.type === "music" && asset.format !== "ogg") {
            targetFormat = "ogg";
          }
          break;
        case "unity":
          targetDir = output_directory || "Assets/Audio";
          break;
        case "unreal":
          targetDir = output_directory || "Content/Audio";
          // Unreal prefers WAV
          targetFormat = "wav";
          break;
        default:
          targetDir = output_directory || "./audio-export";
      }

      // For now, just copy the file (format conversion would require ffmpeg)
      const targetPath = path.join(
        targetDir,
        asset.type,
        `${asset.name}.${targetFormat}`
      );

      try {
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.copyFile(asset.filePath, targetPath);

        return {
          success: true,
          exportedTo: targetPath,
          format: targetFormat,
          engine,
          note:
            targetFormat !== asset.format
              ? `Format conversion from ${asset.format} to ${targetFormat} requires ffmpeg`
              : undefined,
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to export: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });
}

// Export for use by generation tools to register assets
export function registerAsset(asset: AudioAsset): void {
  assetRegistry.set(asset.id, asset);
}

export { assetRegistry };
