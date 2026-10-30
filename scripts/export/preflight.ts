/** Checks run before any browser starts. Failures are exit code 3. Process and filesystem access are injected. */

export type Check = { ok: true } | { ok: false; message: string }

export function ffmpegCommand(env: Record<string, string | undefined>): string {
  return env.FFMPEG ? env.FFMPEG : 'ffmpeg'
}

export function checkFfmpeg(cmd: string, run: (cmd: string, args: string[]) => { status: number | null; error?: Error | undefined }): Check {
  const r = run(cmd, ['-version'])
  if (r.error || r.status !== 0) {
    return {
      ok: false,
      message: `ffmpeg was not found or did not run ("${cmd} -version"). Install ffmpeg with your package manager, or set the FFMPEG environment variable to its path.`,
    }
  }
  return { ok: true }
}

export function checkBrowser(executablePath: string, exists: (p: string) => boolean): Check {
  if (!exists(executablePath)) {
    return { ok: false, message: `Playwright's chromium is not installed (looked for ${executablePath}). Run: npx playwright install chromium` }
  }
  return { ok: true }
}
