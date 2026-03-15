import type {
  AudioProvider,
  SFXGenerationRequest,
  MusicGenerationRequest,
  VoiceGenerationRequest,
  GenerationResult,
} from "../types.js";

export abstract class BaseAudioProvider implements AudioProvider {
  abstract name: string;
  protected apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async generateSFX(_request: SFXGenerationRequest): Promise<GenerationResult> {
    return {
      success: false,
      error: `${this.name} does not support SFX generation`,
    };
  }

  async generateMusic(_request: MusicGenerationRequest): Promise<GenerationResult> {
    return {
      success: false,
      error: `${this.name} does not support music generation`,
    };
  }

  async generateVoice(_request: VoiceGenerationRequest): Promise<GenerationResult> {
    return {
      success: false,
      error: `${this.name} does not support voice generation`,
    };
  }

  async listVoices(_search?: string): Promise<Array<{ id: string; name: string; category?: string; preview_url?: string }>> {
    return [];
  }
}
