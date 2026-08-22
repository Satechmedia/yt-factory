import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

export function commandExists(bin: string): boolean {
  if (bin.includes("/")) {
    return existsSync(bin);
  }
  const path = process.env.PATH ?? "";
  return path.split(":").some((dir) => existsSync(`${dir}/${bin}`));
}

export function run(
  bin: string,
  args: string[],
  stdin?: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: string[] = [];
    const err: string[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      const stdout = out.join("");
      const stderr = err.join("");
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${bin} exited ${code}: ${stderr.trim() || stdout.trim()}`));
    });
    if (stdin !== undefined) {
      child.stdin.end(stdin);
    } else {
      child.stdin.end();
    }
  });
}
