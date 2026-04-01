# Audio MCP

`@genai-gametools/audio-mcp` is a stdio-based [Model Context Protocol](https://modelcontextprotocol.io/) server for AI audio workflows.

It is designed for agentic tooling, prototypes, and game pipelines where an LLM should be able to do more than just suggest prompts. Instead of wiring several audio APIs and local processing scripts into every client, this server gives you one MCP endpoint that can generate audio, keep track of the files it creates, and run common post-processing steps on the results.

In practice, that means an MCP client can ask for a laser blast, an ambient exploration loop, a voiced line of dialogue, or an engine-ready export without needing custom glue code for each provider. Generated files are written to disk, so they can move directly into your content pipeline, test scene, or game project.

The server currently exposes tools for:

- generating music, sound effects, and voice
- organizing generated assets
- running common audio-processing steps with `ffmpeg`

That makes it useful both as a creative generation layer and as a practical bridge between cloud audio models and local project assets.

The current implementation supports three providers:

- `elevenlabs` for SFX, music, voice, and voice listing
- `stable-audio` for music and SFX
- `suno` for music

## Good Fit For

- MCP clients that need one audio tool surface instead of provider-specific integrations
- game and interactive prototypes that need fast iteration on SFX, music beds, and voice lines
- asset pipelines that want generated files saved locally and available for later processing
- workflows that need basic cleanup steps like trimming, fading, looping, normalization, and conversion

## Features

### Generation

- `generate_sfx`
- `generate_music`
- `generate_voice`
- `list_voices`
- `audio_provider_status`

### Asset Management

- `list_audio_assets`
- `get_audio_asset`
- `delete_audio_asset`
- `scan_audio_directory`
- `tag_audio_asset`
- `export_audio_for_engine`

### Processing

- `trim_audio`
- `fade_audio`
- `loop_audio`
- `normalize_audio`
- `convert_audio`
- `concatenate_audio`
- `get_audio_info`
- `check_ffmpeg`

## Requirements

- Node.js `18+`
- `ffmpeg` and `ffprobe` in `PATH` for the processing tools
- Provider credentials for the tools you want to enable

## Installation

```bash
npm install
npm run build
```

## Configuration

The server reads provider credentials from environment variables:

| Variable | Provider | Notes |
| --- | --- | --- |
| `ELEVENLABS_API_KEY` | ElevenLabs | Enables SFX, music, voice, and `list_voices` |
| `STABILITY_API_KEY` | Stable Audio | Enables music and SFX |
| `SUNO_COOKIE` | Suno | Uses your Suno session cookie for music generation |
| `AUDIO_OUTPUT_PATH` | Server | Optional default output directory |

You can also override the output directory at runtime:

```bash
node dist/index.js --output ./generated-audio
```

## Using It As An MCP Server

Example MCP config:

```json
{
  "mcpServers": {
    "audio": {
      "command": "node",
      "args": ["/absolute/path/to/audio-mcp/dist/index.js"],
      "env": {
        "ELEVENLABS_API_KEY": "your-key",
        "STABILITY_API_KEY": "your-key",
        "SUNO_COOKIE": "your-cookie",
        "AUDIO_OUTPUT_PATH": "/absolute/path/to/generated-audio"
      }
    }
  }
}
```

If you publish or install the package globally, the packaged binary is:

```bash
genai-audio-mcp
```

## Development

Build the server:

```bash
npm run build
```

Start it directly:

```bash
npm start
```

Run it under the MCP inspector:

```bash
npm run inspector
```

## Output Layout

Generated files are written under the configured output directory using subfolders such as:

- `sfx/`
- `music/`
- `voice/`
- `processed/`

## Provider Notes

- `elevenlabs` is the default provider for `generate_sfx`, `generate_music`, and `generate_voice`.
- `stable-audio` currently handles direct audio file generation for music and SFX.
- `suno` currently supports music generation only and polls until the first returned clip finishes.

## Operational Notes

- The asset registry is in-memory. If the server restarts, previously generated files will not be listed until you call `scan_audio_directory`.
- Processing tools shell out to `ffmpeg`, so they fail fast when `ffmpeg` is missing.
- Exporting for game engines currently copies files into engine-style folders. If a different format is recommended, the tool reports that conversion still requires `ffmpeg`.

## Package Scripts

```bash
npm run build
npm run dev
npm start
npm test
npm run inspector
```

## License

MIT
