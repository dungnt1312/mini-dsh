#!/usr/bin/env node
/** Hook fixture: stdin JSON; modes controlled by argv[2]. */
const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
const mode = process.argv[2] ?? 'allow'
if (mode === 'block') {
  process.stderr.write('blocked by fixture\n')
  process.exit(2)
}
if (mode === 'rewrite') {
  process.stdout.write(JSON.stringify({ updatedInput: { ...payload.args, rewritten: true } }))
  process.exit(0)
}
if (mode === 'inject') {
  process.stdout.write(JSON.stringify({ injected: 'fixture injected context' }))
  process.exit(0)
}
if (mode === 'flag') {
  process.stdout.write(JSON.stringify({ flagged: 'possible secret' }))
  process.exit(0)
}
if (mode === 'fail') process.exit(1)
if (mode === 'hang') {
  await new Promise(() => {
    setInterval(() => {}, 1_000)
  })
}
process.exit(0)
