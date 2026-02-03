import { rm } from 'node:fs/promises'
import esbuild from 'esbuild'

const isWatch = process.argv.includes('--watch')

await rm(new URL('../dist', import.meta.url), { recursive: true, force: true })

const buildOptions = {
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: ['node20'],
  sourcemap: true,
  logLevel: 'info'
}

if (!isWatch) {
  await esbuild.build(buildOptions)
  process.exitCode = 0
} else {
  const ctx = await esbuild.context(buildOptions)
  await ctx.watch()
  // Keep process alive for watch mode.
}
