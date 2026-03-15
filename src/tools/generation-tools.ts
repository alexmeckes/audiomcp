/**
 * Audio generation tools for the MCP server
 */

import { z } from "zod";
import type { ToolHandler, ServerState, AudioProvider } from "../types.js";

export function registerGenerationTools(
  tools: Map<string, ToolHandler>,
  state: ServerState,
  providers: Map<string, AudioProvider>
): void {
  // Generate sound effect
  tools.set("generate_sfx", {
    description:
      "Generate a sound effect using AI. Describe the sound you want (e.g., 'laser gun firing', 'wooden door creaking', 'coin pickup chime'). Returns the generated audio file path.",
    inputSchema: z.object({
      prompt: z
        .string()
        .describe("Description of the sound effect to generate"),
      duration_seconds: z
        .number()
        .min(0.5)
        .max(30)
        .optional()
        .describe("Duration in seconds (0.5-30, default: auto-detected)"),
      prompt_influence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("How closely to follow the prompt (0-1, default: 0.3). Higher values follow the prompt more strictly."),
      loop: z
        .boolean()
        .optional()
        .describe("Generate seamless looping audio (ElevenLabs v2 feature)"),
      provider: z
        .enum(["elevenlabs", "stable-audio"])
        .optional()
        .describe("Which AI provider to use (default: elevenlabs)"),
      output_format: z
        .enum(["mp3", "wav", "ogg"])
        .optional()
        .describe("Output audio format (default: mp3)"),
    }),
    handler: async (args) => {
      const {
        prompt,
        duration_seconds,
        prompt_influence,
        loop,
        provider: providerName,
        output_format,
      } = args as {
        prompt: string;
        duration_seconds?: number;
        prompt_influence?: number;
        loop?: boolean;
        provider?: string;
        output_format?: "mp3" | "wav" | "ogg";
      };

      const provider = providers.get(providerName || "elevenlabs");
      if (!provider) {
        return { success: false, error: `Provider not found: ${providerName}` };
      }

      if (!provider.isConfigured()) {
        return {
          success: false,
          error: `Provider ${provider.name} is not configured. Set the appropriate API key.`,
        };
      }

      if (!provider.generateSFX) {
        return {
          success: false,
          error: `Provider ${provider.name} does not support SFX generation`,
        };
      }

      const result = await provider.generateSFX({
        prompt,
        durationSeconds: duration_seconds,
        promptInfluence: prompt_influence,
        loop,
        outputFormat: output_format,
      });

      return result;
    },
  });

  // Generate music
  tools.set("generate_music", {
    description:
      "Generate background music or a musical track using AI. Describe the style and mood (e.g., 'upbeat chiptune battle theme', 'ambient forest soundscape', 'tense horror music').",
    inputSchema: z.object({
      prompt: z.string().describe("Description of the music to generate"),
      style: z
        .string()
        .optional()
        .describe(
          "Musical style (e.g., 'orchestral', 'electronic', '8bit', 'ambient')"
        ),
      duration_seconds: z
        .number()
        .min(5)
        .max(180)
        .optional()
        .describe("Duration in seconds (5-180, default: 30)"),
      loop: z
        .boolean()
        .optional()
        .describe("Whether the track should be designed to loop seamlessly"),
      force_instrumental: z
        .boolean()
        .optional()
        .describe("Force instrumental output with no vocals (ElevenLabs only)"),
      seed: z
        .number()
        .int()
        .optional()
        .describe("Seed for deterministic generation (ElevenLabs only)"),
      provider: z
        .enum(["elevenlabs", "stable-audio", "suno"])
        .optional()
        .describe("Which AI provider to use (default: elevenlabs). ElevenLabs Eleven Music for high-quality game music."),
      output_format: z
        .enum(["mp3", "wav", "ogg"])
        .optional()
        .describe("Output audio format (default: mp3)"),
    }),
    handler: async (args) => {
      const {
        prompt,
        style,
        duration_seconds,
        loop,
        force_instrumental,
        seed,
        provider: providerName,
        output_format,
      } = args as {
        prompt: string;
        style?: string;
        duration_seconds?: number;
        loop?: boolean;
        force_instrumental?: boolean;
        seed?: number;
        provider?: string;
        output_format?: "mp3" | "wav" | "ogg";
      };

      const provider = providers.get(providerName || "elevenlabs");
      if (!provider) {
        return { success: false, error: `Provider not found: ${providerName}` };
      }

      if (!provider.isConfigured()) {
        return {
          success: false,
          error: `Provider ${provider.name} is not configured. Set the appropriate API key.`,
        };
      }

      if (!provider.generateMusic) {
        return {
          success: false,
          error: `Provider ${provider.name} does not support music generation`,
        };
      }

      const result = await provider.generateMusic({
        prompt,
        style,
        durationSeconds: duration_seconds,
        loop,
        forceInstrumental: force_instrumental,
        seed,
        outputFormat: output_format,
      });

      return result;
    },
  });

  // Generate voice/dialogue
  tools.set("generate_voice", {
    description:
      "Generate spoken dialogue or narration using AI text-to-speech. Provide the text to speak and optionally specify a voice.",
    inputSchema: z.object({
      text: z.string().describe("The text to convert to speech"),
      voice_id: z
        .string()
        .optional()
        .describe("Voice ID to use (use list_voices to see available voices)"),
      model_id: z
        .enum([
          "eleven_multilingual_v2",
          "eleven_v3",
          "eleven_v3_conversational",
          "eleven_monolingual_v1",
          "eleven_turbo_v2",
          "eleven_turbo_v2_5",
        ])
        .optional()
        .describe("TTS model to use (default: eleven_multilingual_v2). eleven_v3 is newest and highest quality. eleven_turbo_v2_5 is lowest latency. eleven_v3_conversational is optimized for agent/dialogue use."),
      language_code: z
        .string()
        .optional()
        .describe("ISO 639-1 language code (e.g., 'en', 'es', 'ja'). Useful with multilingual models."),
      stability: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Voice stability (0-1, default: 0.5)"),
      similarity_boost: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Similarity boost (0-1, default: 0.75)"),
      style: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Style exaggeration (0-1). Higher values add more expressiveness."),
      speed: z
        .number()
        .min(0.5)
        .max(2.0)
        .optional()
        .describe("Speech speed (0.5-2.0, default: 1.0). Values below 1.0 are slower, above are faster."),
      use_speaker_boost: z
        .boolean()
        .optional()
        .describe("Boost similarity to the original speaker. Increases latency slightly."),
      seed: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Seed for deterministic generation (0-4294967295)"),
      provider: z
        .enum(["elevenlabs"])
        .optional()
        .describe("Which AI provider to use (default: elevenlabs)"),
      output_format: z
        .enum(["mp3", "wav", "ogg"])
        .optional()
        .describe("Output audio format (default: mp3)"),
    }),
    handler: async (args) => {
      const {
        text,
        voice_id,
        model_id,
        language_code,
        stability,
        similarity_boost,
        style,
        speed,
        use_speaker_boost,
        seed,
        provider: providerName,
        output_format,
      } = args as {
        text: string;
        voice_id?: string;
        model_id?: string;
        language_code?: string;
        stability?: number;
        similarity_boost?: number;
        style?: number;
        speed?: number;
        use_speaker_boost?: boolean;
        seed?: number;
        provider?: string;
        output_format?: "mp3" | "wav" | "ogg";
      };

      const provider = providers.get(providerName || "elevenlabs");
      if (!provider) {
        return { success: false, error: `Provider not found: ${providerName}` };
      }

      if (!provider.isConfigured()) {
        return {
          success: false,
          error: `Provider ${provider.name} is not configured. Set the appropriate API key.`,
        };
      }

      if (!provider.generateVoice) {
        return {
          success: false,
          error: `Provider ${provider.name} does not support voice generation`,
        };
      }

      const result = await provider.generateVoice({
        text,
        voiceId: voice_id,
        modelId: model_id,
        languageCode: language_code,
        voiceSettings: {
          stability,
          similarityBoost: similarity_boost,
          style,
          speed,
          useSpeakerBoost: use_speaker_boost,
        },
        seed,
        outputFormat: output_format,
      });

      return result;
    },
  });

  // List available voices
  tools.set("list_voices", {
    description: "List available voices for text-to-speech generation. Supports searching by name or description.",
    inputSchema: z.object({
      search: z
        .string()
        .optional()
        .describe("Search voices by name, description, or labels"),
      provider: z
        .enum(["elevenlabs"])
        .optional()
        .describe("Which provider to list voices from (default: elevenlabs)"),
    }),
    handler: async (args) => {
      const { search, provider: providerName } = args as { search?: string; provider?: string };

      const provider = providers.get(providerName || "elevenlabs");
      if (!provider) {
        return { success: false, error: `Provider not found: ${providerName}` };
      }

      if (!provider.isConfigured()) {
        return {
          success: false,
          error: `Provider ${provider.name} is not configured. Set the appropriate API key.`,
        };
      }

      if (!provider.listVoices) {
        return {
          success: false,
          error: `Provider ${provider.name} does not support listing voices`,
        };
      }

      const voices = await provider.listVoices(search);
      return { success: true, voices };
    },
  });

  // Check provider status
  tools.set("audio_provider_status", {
    description:
      "Check which audio generation providers are configured and available.",
    inputSchema: z.object({}),
    handler: async () => {
      const status: Record<
        string,
        { configured: boolean; capabilities: string[] }
      > = {};

      for (const [name, provider] of providers) {
        const capabilities: string[] = [];
        if (provider.generateSFX) capabilities.push("sfx");
        if (provider.generateMusic) capabilities.push("music");
        if (provider.generateVoice) capabilities.push("voice");

        status[name] = {
          configured: provider.isConfigured(),
          capabilities,
        };
      }

      return { providers: status };
    },
  });
}
