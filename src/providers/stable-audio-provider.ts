import * as fs from "fs/promises";
import * as path from "path";
import { BaseAudioProvider } from "./base-provider.js";
import type {
  MusicGenerationRequest,
  SFXGenerationRequest,
  GenerationResult,
  AudioAsset,
} from "../types.js";
import { generateId, ensureDir } from "../utils/helpers.js";

const STABLE_AUDIO_API_BASE = "https://api.stability.ai/v2beta/audio";

export class StableAudioProvider extends BaseAudioProvider {
  name = "stable-audio";
  private outputPath: string;

  constructor(apiKey?: string, outputPath: string = "./generated-audio") {
    super(apiKey || process.env.STABILITY_API_KEY);
    this.outputPath = outputPath;
  }

  async generateMusic(request: MusicGenerationRequest): Promise<GenerationResult> {
    if (!this.isConfigured()) {
      return { success: false, error: "Stability API key not configured" };
    }

    try {
      const prompt = request.style
        ? `${request.style} style: ${request.prompt}`
        : request.prompt;

      const response = await fetch(`${STABLE_AUDIO_API_BASE}/generate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          duration: request.durationSeconds || 30,
          output_format: request.outputFormat || "mp3",
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Stable Audio API error: ${error}` };
      }

      const audioBuffer = await response.arrayBuffer();
      const id = generateId();
      const format = request.outputFormat || "mp3";
      const filename = `music_${id}.${format}`;
      const filePath = path.join(this.outputPath, "music", filename);

      await ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, Buffer.from(audioBuffer));

      const asset: AudioAsset = {
        id,
        type: "music",
        name: request.prompt.slice(0, 50),
        filePath,
        format,
        durationMs: (request.durationSeconds || 30) * 1000,
        sampleRate: 44100,
        provider: this.name,
        prompt: request.prompt,
        tags: extractMusicTags(request.prompt, request.style),
        createdAt: new Date().toISOString(),
        metadata: {
          style: request.style,
          loop: request.loop,
        },
      };

      return { success: true, asset };
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate music: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async generateSFX(request: SFXGenerationRequest): Promise<GenerationResult> {
    if (!this.isConfigured()) {
      return { success: false, error: "Stability API key not configured" };
    }

    try {
      // Stable Audio can also generate short sound effects
      const response = await fetch(`${STABLE_AUDIO_API_BASE}/generate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: `sound effect: ${request.prompt}`,
          duration: request.durationSeconds || 2,
          output_format: request.outputFormat || "mp3",
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Stable Audio API error: ${error}` };
      }

      const audioBuffer = await response.arrayBuffer();
      const id = generateId();
      const format = request.outputFormat || "mp3";
      const filename = `sfx_${id}.${format}`;
      const filePath = path.join(this.outputPath, "sfx", filename);

      await ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, Buffer.from(audioBuffer));

      const asset: AudioAsset = {
        id,
        type: "sfx",
        name: request.prompt.slice(0, 50),
        filePath,
        format,
        durationMs: (request.durationSeconds || 2) * 1000,
        sampleRate: 44100,
        provider: this.name,
        prompt: request.prompt,
        tags: ["sfx"],
        createdAt: new Date().toISOString(),
      };

      return { success: true, asset };
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate SFX: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

function extractMusicTags(prompt: string, style?: string): string[] {
  const tags: string[] = ["music"];
  const lowerPrompt = prompt.toLowerCase();

  if (style) {
    tags.push(style.toLowerCase());
  }

  const genres = {
    ambient: ["ambient", "atmospheric", "drone", "meditation"],
    electronic: ["electronic", "synth", "techno", "edm", "dubstep"],
    orchestral: ["orchestral", "orchestra", "epic", "cinematic", "dramatic"],
    rock: ["rock", "guitar", "metal", "punk"],
    jazz: ["jazz", "swing", "blues"],
    retro: ["retro", "8bit", "chiptune", "arcade", "pixel"],
    horror: ["horror", "creepy", "scary", "dark", "tension"],
    action: ["action", "intense", "battle", "combat", "fight"],
    peaceful: ["peaceful", "calm", "relaxing", "gentle", "soft"],
  };

  for (const [genre, keywords] of Object.entries(genres)) {
    if (keywords.some((k) => lowerPrompt.includes(k))) {
      tags.push(genre);
    }
  }

  return tags;
}
