import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const outputDirectory = path.resolve(process.argv[2] || 'dist')
const basePath = process.env.VITE_BASE_PATH
const apiUrl = process.env.VITE_API_BASE_URL
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY

assert.equal(basePath, '/WFH-PULSE/', 'Pages assets must use the repository subpath.')
assert.equal(apiUrl, 'https://tuypfaqcqsxzuswiglyw.supabase.co/rest/v1/',
    'Pages must use the production REST API.')
assert.ok(publishableKey, 'The production publishable key is required.')
assert.ok(!publishableKey.startsWith('sb_secret_'), 'Do not use a Supabase secret key in the frontend.')

const html = fs.readFileSync(path.join(outputDirectory, 'index.html'), 'utf8')
assert.ok(!html.includes('/src/main.tsx'), 'Deploy the Vite build, not the source index.html.')

const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1])
assert.ok(assets.some(asset => asset.endsWith('.js')), 'The built JavaScript entry point is missing.')
assert.ok(assets.some(asset => asset.endsWith('.css')), 'The built stylesheet is missing.')

let javascript = ''
for (const asset of assets) {
    assert.ok(asset.startsWith(`${basePath}assets/`), `Incorrect Pages asset path: ${asset}`)
    const assetPath = path.join(outputDirectory, asset.slice(basePath.length))
    assert.ok(fs.existsSync(assetPath), `Missing built asset: ${asset}`)
    if (asset.endsWith('.js')) javascript += fs.readFileSync(assetPath, 'utf8')
}

assert.ok(javascript.includes(apiUrl.replace(/\/+$/, '')), 'The bundle is missing the production API URL.')
assert.ok(javascript.includes(publishableKey), 'The bundle is missing the production publishable key.')
assert.ok(!/https?:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2):8787/.test(javascript),
    'The Pages bundle must not target a local development API.')

console.log('Pages build verified: compiled assets, repository base path, and production API configuration.')
