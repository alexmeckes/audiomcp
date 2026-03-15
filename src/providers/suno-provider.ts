import * as fs from "fs/promises";
import * as path from "path";
import { BaseAudioProvider } from "./base-provider.js";
import type {
  MusicGenerationRequest,
  GenerationResult,
  AudioAsset,
} from "../types.js";
import { generateId, ensureDir } from "../utils/helpers.js";

const SUNO_API_BASE = "https://studio-api.suno.ai";
const SUNO_CLERK_BASE = "https://clerk.suno.com";

interface SunoClip {
  id: string;
  audio_url: string;
  title: string;
  status: string;
  duration: number;
  created_at: string;
}

export class SunoProvider extends BaseAudioProvider {
  name = "suno";
  private outputPath: string;
  private sessionId: string | undefined;

  constructor(apiKey?: string, outputPath: string = "./generated-audio") {
    // Suno uses a cookie-based auth, the "apiKey" here is actually the session cookie
    super(apiKey || process.env.SUNO_COOKIE);
    this.outputPath = outputPath;
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    return {
      Cookie: this.apiKey || "",
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    };
  }

  async generateMusic(request: MusicGenerationRequest): Promise<GenerationResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error:
          "Suno not configured. Set SUNO_COOKIE environment variable with your session cookie.",
      };
    }

    try {
      const headers = await this.getAuthHeaders();

      // Build the prompt with style if provided
      let fullPrompt = request.prompt;
      if (request.style) {
        fullPrompt = `${request.style} style: ${request.prompt}`;
      }

      // Generate music using Suno's API
      const generateResponse = await fetch(`${SUNO_API_BASE}/api/generate/v2/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt: fullPrompt,
          make_instrumental: false,
          wait_audio: false,
        }),
      });

      if (!generateResponse.ok) {
        const error = await generateResponse.text();
        return { success: false, error: `Suno API error: ${error}` };
      }

      const generateData = (await generateResponse.json()) as {
        clips: SunoClip[];
      };

      if (!generateData.clips || generateData.clips.length === 0) {
        return { success: false, error: "No clips returned from Suno" };
      }

      const clip = generateData.clips[0];

      // Poll for completion
      const completedClip = await this.waitForCompletion(clip.id, headers);
      if (!completedClip) {
        return { success: false, error: "Timeout waiting for Suno generation" };
      }

      // Download the audio
      const audioResponse = await fetch(completedClip.audio_url);
      if (!audioResponse.ok) {
        return { success: false, error: "Failed to download generated audio" };
      }

      const audioBuffer = await audioResponse.arrayBuffer();
      const id = generateId();
      const filename = `music_suno_${id}.mp3`;
      const filePath = path.join(this.outputPath, "music", filename);

      await ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, Buffer.from(audioBuffer));

      const asset: AudioAsset = {
        id,
        type: "music",
        name: completedClip.title || request.prompt.slice(0, 50),
        filePath,
        format: "mp3",
        durationMs: (completedClip.duration || 30) * 1000,
        sampleRate: 44100,
        provider: this.name,
        prompt: request.prompt,
        tags: extractMusicTags(request.prompt, request.style),
        createdAt: new Date().toISOString(),
        metadata: {
          sunoClipId: completedClip.id,
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

  private async waitForCompletion(
    clipId: string,
    headers: Record<string, string>,
    maxAttempts: number = 60,
    delayMs: number = 5000
  ): Promise<SunoClip | null> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(
          `${SUNO_API_BASE}/api/feed/?ids=${clipId}`,
          { headers }
        );

        if (response.ok) {
          const data = (await response.json()) as SunoClip[];
          if (data && data.length > 0) {
            const clip = data[0];
            if (clip.status === "complete" && clip.audio_url) {
              return clip;
            }
            if (clip.status === "error") {
              return null;
            }
          }
        }
      } catch {
        // Continue polling
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    return null;
  }
}

function extractMusicTags(prompt: string, style?: string): string[] {
  const tags: string[] = ["music", "suno"];
  const lowerPrompt = prompt.toLowerCase();

  if (style) {
    tags.push(style.toLowerCase());
  }

  const genres = {
    ambient: ["ambient", "atmospheric", "drone", "meditation"],
    electronic: ["electronic", "synth", "techno", "edm", "dubstep", "house"],
    orchestral: ["orchestral", "orchestra", "epic", "cinematic", "dramatic"],
    rock: ["rock", "guitar", "metal", "punk", "grunge"],
    jazz: ["jazz", "swing", "blues", "smooth"],
    retro: ["retro", "8bit", "chiptune", "arcade", "pixel", "synthwave"],
    horror: ["horror", "creepy", "scary", "dark", "tension", "suspense"],
    action: ["action", "intense", "battle", "combat", "fight", "boss"],
    peaceful: ["peaceful", "calm", "relaxing", "gentle", "soft", "chill"],
    folk: ["folk", "acoustic", "celtic", "medieval"],
    hiphop: ["hip hop", "rap", "beat", "trap"],
    pop: ["pop", "catchy", "upbeat"],
  };

  for (const [genre, keywords] of Object.entries(genres)) {
    if (keywords.some((k) => lowerPrompt.includes(k))) {
      tags.push(genre);
    }
  }

  return tags;
}
