import { z } from "zod";

// Tool registry types
export interface ToolHandler {
  description: string;
  inputSchema: z.ZodType<unknown>;
  handler: (args: unknown) => Promise<unknown>;
}

// Server state
export interface ServerState {
  outputPath: string;
  providers: {
    elevenlabs?: { apiKey: string };
    suno?: { apiKey: string };
    stableAudio?: { apiKey: string };
  };
}

// Audio asset metadata
export interface AudioAsset {
  id: string;
  type: "sfx" | "music" | "voice";
  name: string;
  filePath: string;
  format: string;
  durationMs: number;
  sampleRate: number;
  provider: string;
  prompt: string;
  tags: string[];
  createdAt: string;
  metadata?: Record<string, unknown>;
}

// Generation request types
export interface SFXGenerationRequest {
  prompt: string;
  durationSeconds?: number;
  promptInfluence?: number;
  loop?: boolean;
  outputFormat?: "mp3" | "wav" | "ogg";
}

export interface MusicGenerationRequest {
  prompt: string;
  style?: string;
  durationSeconds?: number;
  loop?: boolean;
  forceInstrumental?: boolean;
  seed?: number;
  outputFormat?: "mp3" | "wav" | "ogg";
}

export interface VoiceGenerationRequest {
  text: string;
  voiceId?: string;
  modelId?: string;
  languageCode?: string;
  voiceSettings?: {
    stability?: number;
    similarityBoost?: number;
    style?: number;
    speed?: number;
    useSpeakerBoost?: boolean;
  };
  seed?: number;
  outputFormat?: "mp3" | "wav" | "ogg";
}

// Generation result
export interface GenerationResult {
  success: boolean;
  asset?: AudioAsset;
  error?: string;
}

// Provider interface
export interface AudioProvider {
  name: string;
  isConfigured(): boolean;
  generateSFX?(request: SFXGenerationRequest): Promise<GenerationResult>;
  generateMusic?(request: MusicGenerationRequest): Promise<GenerationResult>;
  generateVoice?(request: VoiceGenerationRequest): Promise<GenerationResult>;
  listVoices?(search?: string): Promise<Array<{ id: string; name: string; category?: string; preview_url?: string }>>;
}
