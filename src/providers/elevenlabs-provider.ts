import * as fs from "fs/promises";
import * as path from "path";
import { BaseAudioProvider } from "./base-provider.js";
import type {
  SFXGenerationRequest,
  MusicGenerationRequest,
  VoiceGenerationRequest,
  GenerationResult,
  AudioAsset,
} from "../types.js";
import { generateId, ensureDir } from "../utils/helpers.js";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

export class ElevenLabsProvider extends BaseAudioProvider {
  name = "elevenlabs";
  private outputPath: string;

  constructor(apiKey?: string, outputPath: string = "./generated-audio") {
    super(apiKey || process.env.ELEVENLABS_API_KEY);
    this.outputPath = outputPath;
  }

  async generateSFX(request: SFXGenerationRequest): Promise<GenerationResult> {
    if (!this.isConfigured()) {
      return { success: false, error: "ElevenLabs API key not configured" };
    }

    try {
      const response = await fetch(`${ELEVENLABS_API_BASE}/sound-generation`, {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: request.prompt,
          duration_seconds: request.durationSeconds,
          prompt_influence: request.promptInfluence ?? 0.3,
          ...(request.loop !== undefined && { loop: request.loop }),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `ElevenLabs API error: ${error}` };
      }

      const audioBuffer = await response.arrayBuffer();
      const id = generateId();
      const filename = `sfx_${id}.mp3`;
      const filePath = path.join(this.outputPath, "sfx", filename);

      await ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, Buffer.from(audioBuffer));

      const asset: AudioAsset = {
        id,
        type: "sfx",
        name: request.prompt.slice(0, 50),
        filePath,
        format: "mp3",
        durationMs: (request.durationSeconds || 2) * 1000,
        sampleRate: 44100,
        provider: this.name,
        prompt: request.prompt,
        tags: extractTags(request.prompt),
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

  async generateMusic(request: MusicGenerationRequest): Promise<GenerationResult> {
    if (!this.isConfigured()) {
      return { success: false, error: "ElevenLabs API key not configured" };
    }

    try {
      const durationMs = (request.durationSeconds || 30) * 1000;
      // Clamp to API limits: 3000ms - 600000ms (3s - 10min)
      const clampedDuration = Math.max(3000, Math.min(600000, durationMs));

      const response = await fetch(`${ELEVENLABS_API_BASE}/music`, {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: request.prompt,
          model_id: "music_v1",
          music_length_ms: clampedDuration,
          output_format: "mp3_44100_128",
          ...(request.forceInstrumental !== undefined && { force_instrumental: request.forceInstrumental }),
          ...(request.seed !== undefined && { seed: request.seed }),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `ElevenLabs Music API error: ${error}` };
      }

      const audioBuffer = await response.arrayBuffer();
      const id = generateId();
      const filename = `music_${id}.mp3`;
      const filePath = path.join(this.outputPath, "music", filename);

      await ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, Buffer.from(audioBuffer));

      const asset: AudioAsset = {
        id,
        type: "music",
        name: request.prompt.slice(0, 50),
        filePath,
        format: "mp3",
        durationMs: clampedDuration,
        sampleRate: 44100,
        provider: this.name,
        prompt: request.prompt,
        tags: extractMusicTags(request.prompt),
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

  async generateVoice(request: VoiceGenerationRequest): Promise<GenerationResult> {
    if (!this.isConfigured()) {
      return { success: false, error: "ElevenLabs API key not configured" };
    }

    const voiceId = request.voiceId || "21m00Tcm4TlvDq8ikWAM"; // Default: Rachel

    try {
      const response = await fetch(
        `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": this.apiKey!,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: request.text,
            model_id: request.modelId || "eleven_multilingual_v2",
            ...(request.languageCode && { language_code: request.languageCode }),
            voice_settings: {
              stability: request.voiceSettings?.stability ?? 0.5,
              similarity_boost: request.voiceSettings?.similarityBoost ?? 0.75,
              ...(request.voiceSettings?.style !== undefined && { style: request.voiceSettings.style }),
              ...(request.voiceSettings?.speed !== undefined && { speed: request.voiceSettings.speed }),
              ...(request.voiceSettings?.useSpeakerBoost !== undefined && { use_speaker_boost: request.voiceSettings.useSpeakerBoost }),
            },
            ...(request.seed !== undefined && { seed: request.seed }),
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `ElevenLabs API error: ${error}` };
      }

      const audioBuffer = await response.arrayBuffer();
      const id = generateId();
      const filename = `voice_${id}.mp3`;
      const filePath = path.join(this.outputPath, "voice", filename);

      await ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, Buffer.from(audioBuffer));

      const asset: AudioAsset = {
        id,
        type: "voice",
        name: request.text.slice(0, 50),
        filePath,
        format: "mp3",
        durationMs: estimateVoiceDuration(request.text),
        sampleRate: 44100,
        provider: this.name,
        prompt: request.text,
        tags: ["voice", "dialogue"],
        createdAt: new Date().toISOString(),
        metadata: {
          voiceId,
          modelId: request.modelId || "eleven_multilingual_v2",
        },
      };

      return { success: true, asset };
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate voice: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async listVoices(search?: string): Promise<Array<{ id: string; name: string; category?: string; preview_url?: string }>> {
    if (!this.isConfigured()) {
      return [];
    }

    try {
      const params = new URLSearchParams({ page_size: "100" });
      if (search) {
        params.set("search", search);
      }

      const response = await fetch(
        `https://api.elevenlabs.io/v2/voices?${params.toString()}`,
        {
          headers: {
            "xi-api-key": this.apiKey!,
          },
        }
      );

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as {
        voices: Array<{ voice_id: string; name: string; category?: string; preview_url?: string }>;
      };

      return data.voices.map((v) => ({
        id: v.voice_id,
        name: v.name,
        category: v.category,
        preview_url: v.preview_url,
      }));
    } catch {
      return [];
    }
  }
}

function extractMusicTags(prompt: string): string[] {
  const tags: string[] = ["music"];
  const lowerPrompt = prompt.toLowerCase();

  const genres = {
    ambient: ["ambient", "atmospheric", "soundscape", "drone"],
    electronic: ["electronic", "synth", "techno", "edm", "house"],
    orchestral: ["orchestral", "epic", "cinematic", "symphony"],
    rock: ["rock", "guitar", "metal", "punk"],
    jazz: ["jazz", "swing", "blues"],
    chiptune: ["chiptune", "8-bit", "16-bit", "retro", "pixel"],
    folk: ["folk", "acoustic", "celtic"],
    lofi: ["lofi", "lo-fi", "chill", "relaxing"],
  };

  for (const [genre, keywords] of Object.entries(genres)) {
    if (keywords.some((k) => lowerPrompt.includes(k))) {
      tags.push(genre);
    }
  }

  return tags;
}

function extractTags(prompt: string): string[] {
  const tags: string[] = [];
  const lowerPrompt = prompt.toLowerCase();

  const categories = {
    impact: ["explosion", "crash", "hit", "punch", "slam", "boom"],
    ui: ["click", "beep", "notification", "menu", "button", "select"],
    ambient: ["wind", "rain", "forest", "city", "ocean", "fire"],
    creature: ["monster", "creature", "growl", "roar", "howl"],
    mechanical: ["engine", "machine", "robot", "servo", "gear"],
    magic: ["spell", "magic", "mystical", "enchant", "power"],
    footstep: ["footstep", "walk", "run", "step"],
  };

  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some((k) => lowerPrompt.includes(k))) {
      tags.push(category);
    }
  }

  return tags.length > 0 ? tags : ["sfx"];
}

function estimateVoiceDuration(text: string): number {
  // Rough estimate: ~150 words per minute
  const words = text.split(/\s+/).length;
  return Math.round((words / 150) * 60 * 1000);
}
