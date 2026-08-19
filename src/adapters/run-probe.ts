import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { ArcError } from "../domain/ports.ts";
import { parseProbeSpec } from "../domain/parse-probe.ts";

export async function runProbe(input: {
  targetPath: string;
  spec: unknown;
  source: string;
}): Promise<{ passed: boolean; stdout: string; stderr: string }> {
  parseProbeSpec(input.spec);

  const dir = join(tmpdir(), `arc-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "probe.test.mjs");
  writeFileSync(file, input.source, "utf8");

  const useDocker = process.env.ARC_SANDBOX === "docker";
  if (useDocker) {
    return runDocker(dir, file, input.targetPath);
  }
  return runNode(file);
}

function runNode(file: string): Promise<{ passed: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, ["--test", file], {
      cwd: process.cwd(),
      env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => {
      stdout += c.toString();
    });
    child.stderr.on("data", (c: Buffer) => {
      stderr += c.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ passed: code === 0, stdout, stderr });
    });
  });
}

function runDocker(
  dir: string,
  file: string,
  targetPath: string,
): Promise<{ passed: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", [
      "run",
      "--rm",
      "--network",
      "none",
      "-v",
      `${dir}:/probe:ro`,
      "-v",
      `${targetPath}:/target:ro`,
      "node:22-alpine",
      "node",
      "--experimental-strip-types",
      "--test",
      "/probe/probe.test.mjs",
    ]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => {
      stdout += c.toString();
    });
    child.stderr.on("data", (c: Buffer) => {
      stderr += c.toString();
    });
    child.on("error", (err) => {
      reject(new ArcError(`Docker sandbox failed: ${err.message}`, "sandbox"));
    });
    child.on("close", (code) => {
      resolve({ passed: code === 0, stdout, stderr });
    });
  });
}
