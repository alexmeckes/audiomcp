/**
 * Audio processing tools using ffmpeg
 */

import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import type { ToolHandler, ServerState } from "../types.js";
import { generateId, ensureDir, fileExists } from "../utils/helpers.js";

const execAsync = promisify(exec);

// Check if ffmpeg is available
async function checkFfmpeg(): Promise<boolean> {
  try {
    await execAsync("ffmpeg -version");
    return true;
  } catch {
    return false;
  }
}

export function registerProcessingTools(
  tools: Map<string, ToolHandler>,
  state: ServerState
): void {
  // Trim audio
  tools.set("trim_audio", {
    description:
      "Trim an audio file to a specific start and end time. Requires ffmpeg.",
    inputSchema: z.object({
      input_path: z.string().describe("Path to the input audio file"),
      start_seconds: z
        .number()
        .min(0)
        .describe("Start time in seconds"),
      end_seconds: z
        .number()
        .optional()
        .describe("End time in seconds (omit to trim to end of file)"),
      output_path: z
        .string()
        .optional()
        .describe("Output path (default: auto-generated in output directory)"),
    }),
    handler: async (args) => {
      const { input_path, start_seconds, end_seconds, output_path } = args as {
        input_path: string;
        start_seconds: number;
        end_seconds?: number;
        output_path?: string;
      };

      if (!(await checkFfmpeg())) {
        return { success: false, error: "ffmpeg is not installed or not in PATH" };
      }

      if (!(await fileExists(input_path))) {
        return { success: false, error: `Input file not found: ${input_path}` };
      }

      const ext = path.extname(input_path);
      const outPath =
        output_path ||
        path.join(state.outputPath, "processed", `trimmed_${generateId()}${ext}`);

      await ensureDir(path.dirname(outPath));

      let cmd = `ffmpeg -y -i "${input_path}" -ss ${start_seconds}`;
      if (end_seconds !== undefined) {
        const duration = end_seconds - start_seconds;
        cmd += ` -t ${duration}`;
      }
      cmd += ` -c copy "${outPath}"`;

      try {
        await execAsync(cmd);
        return {
          success: true,
          output_path: outPath,
          start_seconds,
          end_seconds,
        };
      } catch (error) {
        return {
          success: false,
          error: `ffmpeg error: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

  // Add fade in/out
  tools.set("fade_audio", {
    description:
      "Add fade in and/or fade out effects to an audio file. Requires ffmpeg.",
    inputSchema: z.object({
      input_path: z.string().describe("Path to the input audio file"),
      fade_in_seconds: z
        .number()
        .min(0)
        .optional()
        .describe("Fade in duration in seconds"),
      fade_out_seconds: z
        .number()
        .min(0)
        .optional()
        .describe("Fade out duration in seconds"),
      output_path: z
        .string()
        .optional()
        .describe("Output path (default: auto-generated)"),
    }),
    handler: async (args) => {
      const { input_path, fade_in_seconds, fade_out_seconds, output_path } =
        args as {
          input_path: string;
          fade_in_seconds?: number;
          fade_out_seconds?: number;
          output_path?: string;
        };

      if (!(await checkFfmpeg())) {
        return { success: false, error: "ffmpeg is not installed or not in PATH" };
      }

      if (!(await fileExists(input_path))) {
        return { success: false, error: `Input file not found: ${input_path}` };
      }

      if (!fade_in_seconds && !fade_out_seconds) {
        return {
          success: false,
          error: "Must specify at least one of fade_in_seconds or fade_out_seconds",
        };
      }

      // Get duration for fade out calculation
      let duration = 0;
      if (fade_out_seconds) {
        try {
          const { stdout } = await execAsync(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${input_path}"`
          );
          duration = parseFloat(stdout.trim());
        } catch {
          return { success: false, error: "Could not determine audio duration" };
        }
      }

      const ext = path.extname(input_path);
      const outPath =
        output_path ||
        path.join(state.outputPath, "processed", `faded_${generateId()}${ext}`);

      await ensureDir(path.dirname(outPath));

      const filters: string[] = [];
      if (fade_in_seconds) {
        filters.push(`afade=t=in:st=0:d=${fade_in_seconds}`);
      }
      if (fade_out_seconds) {
        const fadeOutStart = duration - fade_out_seconds;
        filters.push(`afade=t=out:st=${fadeOutStart}:d=${fade_out_seconds}`);
      }

      const cmd = `ffmpeg -y -i "${input_path}" -af "${filters.join(",")}" "${outPath}"`;

      try {
        await execAsync(cmd);
        return {
          success: true,
          output_path: outPath,
          fade_in_seconds,
          fade_out_seconds,
        };
      } catch (error) {
        return {
          success: false,
          error: `ffmpeg error: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

  // Create loop
  tools.set("loop_audio", {
    description:
      "Create a seamlessly looping version of an audio file or loop it a specific number of times. Requires ffmpeg.",
    inputSchema: z.object({
      input_path: z.string().describe("Path to the input audio file"),
      loop_count: z
        .number()
        .min(2)
        .max(50)
        .optional()
        .describe("Number of times to loop (2-50, default: 2)"),
      crossfade_seconds: z
        .number()
        .min(0)
        .max(10)
        .optional()
        .describe("Crossfade duration for seamless looping (0-10 seconds)"),
      output_path: z
        .string()
        .optional()
        .describe("Output path (default: auto-generated)"),
    }),
    handler: async (args) => {
      const {
        input_path,
        loop_count = 2,
        crossfade_seconds = 0,
        output_path,
      } = args as {
        input_path: string;
        loop_count?: number;
        crossfade_seconds?: number;
        output_path?: string;
      };

      if (!(await checkFfmpeg())) {
        return { success: false, error: "ffmpeg is not installed or not in PATH" };
      }

      if (!(await fileExists(input_path))) {
        return { success: false, error: `Input file not found: ${input_path}` };
      }

      const ext = path.extname(input_path);
      const outPath =
        output_path ||
        path.join(state.outputPath, "processed", `looped_${generateId()}${ext}`);

      await ensureDir(path.dirname(outPath));

      let cmd: string;

      if (crossfade_seconds > 0) {
        // Create a seamless loop with crossfade
        // This is more complex - we need to create overlapping sections
        const tempPath = path.join(
          state.outputPath,
          "processed",
          `temp_${generateId()}${ext}`
        );

        // First, create the concatenated file
        const concatCmd = `ffmpeg -y -stream_loop ${loop_count - 1} -i "${input_path}" -c copy "${tempPath}"`;
        try {
          await execAsync(concatCmd);
        } catch (error) {
          return {
            success: false,
            error: `Failed to concatenate: ${error instanceof Error ? error.message : String(error)}`,
          };
        }

        // Apply crossfade filter
        cmd = `ffmpeg -y -i "${tempPath}" -af "acrossfade=d=${crossfade_seconds}:c1=tri:c2=tri" "${outPath}"`;

        try {
          await execAsync(cmd);
          // Clean up temp file
          await fs.unlink(tempPath).catch(() => {});
        } catch (error) {
          await fs.unlink(tempPath).catch(() => {});
          return {
            success: false,
            error: `ffmpeg error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      } else {
        // Simple loop without crossfade
        cmd = `ffmpeg -y -stream_loop ${loop_count - 1} -i "${input_path}" -c copy "${outPath}"`;

        try {
          await execAsync(cmd);
        } catch (error) {
          return {
            success: false,
            error: `ffmpeg error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }

      return {
        success: true,
        output_path: outPath,
        loop_count,
        crossfade_seconds,
      };
    },
  });

  // Normalize volume
  tools.set("normalize_audio", {
    description:
      "Normalize the volume of an audio file to a target level. Requires ffmpeg.",
    inputSchema: z.object({
      input_path: z.string().describe("Path to the input audio file"),
      target_loudness: z
        .number()
        .min(-70)
        .max(0)
        .optional()
        .describe("Target loudness in LUFS (default: -16)"),
      output_path: z
        .string()
        .optional()
        .describe("Output path (default: auto-generated)"),
    }),
    handler: async (args) => {
      const { input_path, target_loudness = -16, output_path } = args as {
        input_path: string;
        target_loudness?: number;
        output_path?: string;
      };

      if (!(await checkFfmpeg())) {
        return { success: false, error: "ffmpeg is not installed or not in PATH" };
      }

      if (!(await fileExists(input_path))) {
        return { success: false, error: `Input file not found: ${input_path}` };
      }

      const ext = path.extname(input_path);
      const outPath =
        output_path ||
        path.join(
          state.outputPath,
          "processed",
          `normalized_${generateId()}${ext}`
        );

      await ensureDir(path.dirname(outPath));

      // Use loudnorm filter for proper loudness normalization
      const cmd = `ffmpeg -y -i "${input_path}" -af "loudnorm=I=${target_loudness}:TP=-1.5:LRA=11" "${outPath}"`;

      try {
        await execAsync(cmd);
        return {
          success: true,
          output_path: outPath,
          target_loudness,
        };
      } catch (error) {
        return {
          success: false,
          error: `ffmpeg error: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

  // Convert format
  tools.set("convert_audio", {
    description:
      "Convert an audio file to a different format. Requires ffmpeg.",
    inputSchema: z.object({
      input_path: z.string().describe("Path to the input audio file"),
      output_format: z
        .enum(["mp3", "wav", "ogg", "flac", "aac", "m4a"])
        .describe("Target audio format"),
      bitrate: z
        .string()
        .optional()
        .describe("Bitrate for lossy formats (e.g., '192k', '320k')"),
      sample_rate: z
        .number()
        .optional()
        .describe("Sample rate in Hz (e.g., 44100, 48000)"),
      output_path: z
        .string()
        .optional()
        .describe("Output path (default: auto-generated)"),
    }),
    handler: async (args) => {
      const { input_path, output_format, bitrate, sample_rate, output_path } =
        args as {
          input_path: string;
          output_format: string;
          bitrate?: string;
          sample_rate?: number;
          output_path?: string;
        };

      if (!(await checkFfmpeg())) {
        return { success: false, error: "ffmpeg is not installed or not in PATH" };
      }

      if (!(await fileExists(input_path))) {
        return { success: false, error: `Input file not found: ${input_path}` };
      }

      const outPath =
        output_path ||
        path.join(
          state.outputPath,
          "processed",
          `converted_${generateId()}.${output_format}`
        );

      await ensureDir(path.dirname(outPath));

      let cmd = `ffmpeg -y -i "${input_path}"`;

      if (bitrate) {
        cmd += ` -b:a ${bitrate}`;
      }
      if (sample_rate) {
        cmd += ` -ar ${sample_rate}`;
      }

      // Format-specific settings
      switch (output_format) {
        case "mp3":
          cmd += " -codec:a libmp3lame";
          break;
        case "ogg":
          cmd += " -codec:a libvorbis";
          break;
        case "flac":
          cmd += " -codec:a flac";
          break;
        case "aac":
        case "m4a":
          cmd += " -codec:a aac";
          break;
        case "wav":
          cmd += " -codec:a pcm_s16le";
          break;
      }

      cmd += ` "${outPath}"`;

      try {
        await execAsync(cmd);
        return {
          success: true,
          output_path: outPath,
          output_format,
          bitrate,
          sample_rate,
        };
      } catch (error) {
        return {
          success: false,
          error: `ffmpeg error: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

  // Concatenate audio files
  tools.set("concatenate_audio", {
    description:
      "Concatenate multiple audio files into a single file. Requires ffmpeg.",
    inputSchema: z.object({
      input_paths: z
        .array(z.string())
        .min(2)
        .describe("Array of input file paths to concatenate (in order)"),
      crossfade_seconds: z
        .number()
        .min(0)
        .max(10)
        .optional()
        .describe("Crossfade duration between clips (0-10 seconds)"),
      output_path: z
        .string()
        .optional()
        .describe("Output path (default: auto-generated)"),
    }),
    handler: async (args) => {
      const { input_paths, crossfade_seconds = 0, output_path } = args as {
        input_paths: string[];
        crossfade_seconds?: number;
        output_path?: string;
      };

      if (!(await checkFfmpeg())) {
        return { success: false, error: "ffmpeg is not installed or not in PATH" };
      }

      for (const p of input_paths) {
        if (!(await fileExists(p))) {
          return { success: false, error: `Input file not found: ${p}` };
        }
      }

      const ext = path.extname(input_paths[0]);
      const outPath =
        output_path ||
        path.join(
          state.outputPath,
          "processed",
          `concatenated_${generateId()}${ext}`
        );

      await ensureDir(path.dirname(outPath));

      if (crossfade_seconds > 0) {
        // Build complex filter for crossfade concatenation
        const inputs = input_paths.map((p) => `-i "${p}"`).join(" ");
        const filterParts: string[] = [];

        // First, label all inputs
        for (let i = 0; i < input_paths.length; i++) {
          filterParts.push(`[${i}:a]`);
        }

        // Use acrossfade for pairs
        let currentLabel = "[0:a]";
        for (let i = 1; i < input_paths.length; i++) {
          const nextLabel = i === input_paths.length - 1 ? "[outa]" : `[a${i}]`;
          filterParts.push(
            `${currentLabel}[${i}:a]acrossfade=d=${crossfade_seconds}:c1=tri:c2=tri${nextLabel}`
          );
          currentLabel = nextLabel;
        }

        const filterComplex = filterParts.slice(input_paths.length).join(";");
        const cmd = `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[outa]" "${outPath}"`;

        try {
          await execAsync(cmd);
        } catch (error) {
          return {
            success: false,
            error: `ffmpeg error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      } else {
        // Simple concatenation using concat demuxer
        const listPath = path.join(
          state.outputPath,
          "processed",
          `concat_list_${generateId()}.txt`
        );
        const listContent = input_paths.map((p) => `file '${p}'`).join("\n");

        await fs.writeFile(listPath, listContent);

        const cmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${outPath}"`;

        try {
          await execAsync(cmd);
          await fs.unlink(listPath).catch(() => {});
        } catch (error) {
          await fs.unlink(listPath).catch(() => {});
          return {
            success: false,
            error: `ffmpeg error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }

      return {
        success: true,
        output_path: outPath,
        input_count: input_paths.length,
        crossfade_seconds,
      };
    },
  });

  // Get audio info
  tools.set("get_audio_info", {
    description: "Get detailed information about an audio file using ffprobe.",
    inputSchema: z.object({
      input_path: z.string().describe("Path to the audio file"),
    }),
    handler: async (args) => {
      const { input_path } = args as { input_path: string };

      if (!(await checkFfmpeg())) {
        return {
          success: false,
          error: "ffmpeg/ffprobe is not installed or not in PATH",
        };
      }

      if (!(await fileExists(input_path))) {
        return { success: false, error: `File not found: ${input_path}` };
      }

      try {
        const { stdout } = await execAsync(
          `ffprobe -v quiet -print_format json -show_format -show_streams "${input_path}"`
        );

        const data = JSON.parse(stdout) as {
          format: {
            duration: string;
            bit_rate: string;
            format_name: string;
            size: string;
          };
          streams: Array<{
            codec_name: string;
            sample_rate: string;
            channels: number;
            codec_type: string;
          }>;
        };

        const audioStream = data.streams.find((s) => s.codec_type === "audio");

        return {
          success: true,
          info: {
            duration_seconds: parseFloat(data.format.duration),
            bit_rate: parseInt(data.format.bit_rate, 10),
            format: data.format.format_name,
            size_bytes: parseInt(data.format.size, 10),
            codec: audioStream?.codec_name,
            sample_rate: audioStream ? parseInt(audioStream.sample_rate, 10) : null,
            channels: audioStream?.channels,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: `ffprobe error: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

  // Check ffmpeg availability
  tools.set("check_ffmpeg", {
    description: "Check if ffmpeg is installed and available for audio processing.",
    inputSchema: z.object({}),
    handler: async () => {
      const available = await checkFfmpeg();

      if (available) {
        try {
          const { stdout } = await execAsync("ffmpeg -version");
          const versionMatch = stdout.match(/ffmpeg version ([^\s]+)/);
          return {
            available: true,
            version: versionMatch ? versionMatch[1] : "unknown",
          };
        } catch {
          return { available: true, version: "unknown" };
        }
      }

      return {
        available: false,
        error: "ffmpeg is not installed. Install it with: brew install ffmpeg (macOS) or apt install ffmpeg (Linux)",
      };
    },
  });
}
