#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import * as path from "path";

import type { ToolHandler, ServerState, AudioProvider } from "./types.js";
import { ElevenLabsProvider, StableAudioProvider, SunoProvider } from "./providers/index.js";
import {
  registerGenerationTools,
  registerAssetTools,
  registerAsset,
  registerProcessingTools,
} from "./tools/index.js";

// Tool registry
const tools: Map<string, ToolHandler> = new Map();

// Provider registry
const providers: Map<string, AudioProvider> = new Map();

// Server state
const state: ServerState = {
  outputPath: process.env.AUDIO_OUTPUT_PATH || "./generated-audio",
  providers: {},
};

// Initialize providers
function initializeProviders(): void {
  const outputPath = state.outputPath;

  // ElevenLabs (SFX + Voice)
  const elevenlabs = new ElevenLabsProvider(
    process.env.ELEVENLABS_API_KEY,
    outputPath
  );
  providers.set("elevenlabs", elevenlabs);

  // Stable Audio (Music + SFX)
  const stableAudio = new StableAudioProvider(
    process.env.STABILITY_API_KEY,
    outputPath
  );
  providers.set("stable-audio", stableAudio);

  // Suno (Music)
  const suno = new SunoProvider(
    process.env.SUNO_COOKIE,
    outputPath
  );
  providers.set("suno", suno);
}

// Create MCP server
const server = new Server(
  {
    name: "genai-audio-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const toolList = Array.from(tools.entries()).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema:
      tool.inputSchema instanceof z.ZodObject
        ? zodToJsonSchema(tool.inputSchema)
        : { type: "object", properties: {} },
  }));

  return { tools: toolList };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const tool = tools.get(name);
  if (!tool) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  try {
    const validatedArgs = tool.inputSchema.parse(args);
    const result = await tool.handler(validatedArgs);

    // If result contains an asset, register it
    if (
      result &&
      typeof result === "object" &&
      "asset" in result &&
      result.asset
    ) {
      registerAsset(result.asset as Parameters<typeof registerAsset>[0]);
    }

    return {
      content: [
        {
          type: "text",
          text:
            typeof result === "string" ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// Convert Zod schema to JSON Schema
function zodToJsonSchema(
  schema: z.ZodObject<z.ZodRawShape>
): Record<string, unknown> {
  const shape = schema.shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const zodType = value as z.ZodTypeAny;
    properties[key] = zodTypeToJsonSchema(zodType);

    if (!zodType.isOptional()) {
      required.push(key);
    }
  }

  return {
    type: "object",
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

function zodTypeToJsonSchema(zodType: z.ZodTypeAny): Record<string, unknown> {
  if (zodType instanceof z.ZodOptional) {
    return zodTypeToJsonSchema(zodType.unwrap());
  }

  if (zodType instanceof z.ZodString) {
    return { type: "string", description: zodType.description };
  }

  if (zodType instanceof z.ZodNumber) {
    return { type: "number", description: zodType.description };
  }

  if (zodType instanceof z.ZodBoolean) {
    return { type: "boolean", description: zodType.description };
  }

  if (zodType instanceof z.ZodArray) {
    return {
      type: "array",
      items: zodTypeToJsonSchema(zodType.element),
      description: zodType.description,
    };
  }

  if (zodType instanceof z.ZodObject) {
    return zodToJsonSchema(zodType);
  }

  if (zodType instanceof z.ZodEnum) {
    return {
      type: "string",
      enum: zodType.options,
      description: zodType.description,
    };
  }

  return { type: "string" };
}

// Main entry point
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output" && args[i + 1]) {
      state.outputPath = path.resolve(args[i + 1]);
      i++;
    }
  }

  // Initialize providers
  initializeProviders();

  // Register tools
  registerGenerationTools(tools, state, providers);
  registerAssetTools(tools, state);
  registerProcessingTools(tools, state);

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`GenAI Audio MCP server running`);
  console.error(`Output path: ${state.outputPath}`);
  console.error(`Providers:`);
  for (const [name, provider] of providers) {
    console.error(
      `  - ${name}: ${provider.isConfigured() ? "configured" : "not configured (missing API key)"}`
    );
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
