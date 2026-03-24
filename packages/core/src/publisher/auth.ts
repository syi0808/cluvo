import { execFile } from 'node:child_process'

function exec(command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(command, args, (error, stdout, stderr) => {
      resolve({ code: typeof error?.code === 'number' ? error.code : (error ? 1 : 0), stdout, stderr })
    })
  })
}

export async function checkGhInstalled(): Promise<boolean> {
  try {
    const { code } = await exec('gh', ['--version'])
    return code === 0
  } catch {
    return false
  }
}

export async function checkGhAuth(): Promise<boolean> {
  try {
    const { code } = await exec('gh', ['auth', 'status'])
    return code === 0
  } catch {
    return false
  }
}

export function getGithubToken(): string | undefined {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN
}

export async function isAuthAvailable(): Promise<boolean> {
  return !!(getGithubToken() || (await checkGhAuth()))
}
