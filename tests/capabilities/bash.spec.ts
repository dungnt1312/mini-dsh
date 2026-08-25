/**
 * The bash tool: captured output, exit-code reporting, non-zero exits, and
 * the timeout kill.
 */
import { describe, expect, it } from 'vitest'
import { bashTool } from 'mini-dsh'

describe('bash tool', () => {
  it('captures combined stdout/stderr and appends the exit code', async () => {
    const output = await bashTool().execute({ command: 'echo out; echo err 1>&2; true' })
    expect(output).toContain('out')
    expect(output).toContain('err')
    expect(output).toContain('[exit code: 0]')
  })

  it('reports a non-zero exit code in the suffix', async () => {
    const output = await bashTool({ timeoutMs: 5_000 }).execute({ command: 'exit 3' })
    expect(output).toContain('[exit code: 3]')
  })

  it('kills a command that exceeds the timeout', async () => {
    const start = Date.now()
    const output = await bashTool({ timeoutMs: 300 }).execute({ command: 'sleep 5; echo never' })
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(3_000)
    expect(output).not.toContain('never')
  }, 10_000)

  it('a non-string command argument fails loud', async () => {
    await expect(bashTool().execute({ command: 42 })).rejects.toThrow(/non-empty string/)
  })
})
