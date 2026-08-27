/**
 * CLI smoke: headless has no Settings surface, so it must fail with an
 * actionable message rather than silently switching to a scripted mock.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const binPath = fileURLToPath(new URL('../../src/bins/headless.ts', import.meta.url))

function runCli(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', binPath, ...args], {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      env: { ...process.env, DEEPSEEK_API_KEY: '' },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      resolve({ code, stdout, stderr })
    })
  })
}

describe('headless CLI', () => {
  it('fails clearly instead of falling back to a mock provider', async () => {
    const { code, stdout, stderr } = await runCli(['--message', 'hello'])

    expect(code).toBe(1)
    expect(stdout).toBe('')
    expect(stderr).toContain('headless requires DEEPSEEK_API_KEY')
    expect(stderr).not.toContain('mock provider')
  }, 30_000)
})
