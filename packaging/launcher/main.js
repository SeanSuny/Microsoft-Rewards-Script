#!/usr/bin/env node
/**
 * Microsoft Rewards Script – Portable Launcher
 *
 * This script is bundled by caxa into microsoft-rewards.exe together with
 * a self-contained Node.js runtime. At runtime it:
 *   1. Resolves the portable-package root (directory containing this .exe)
 *   2. Sets PLAYWRIGHT_BROWSERS_PATH so patchright finds the bundled Chromium
 *   3. Downloads Chromium on first run if it is absent
 *   4. Spawns `node.exe dist/index.js` and forwards all I/O + exit codes
 */

'use strict'

const { spawnSync } = require('child_process')
const fs   = require('fs')
const path = require('path')

// ─── Resolve portable-package root ────────────────────────────────────────────
// When caxa wraps this script the real executable is at <pkgRoot>/microsoft-rewards.exe.
// caxa sets CAXA_APPLICATION_PATH to the temporary extraction dir, but we need the
// directory of the *original* .exe so we can locate node.exe, dist/, node_modules/, etc.
// We get that from process.execPath (the .exe itself) when running as a compiled binary,
// or fall back to __dirname during development.
const PKG_ROOT = (() => {
    // caxa exposes the extracted-bundle directory via this env var
    // The .exe itself lives one level above it (<pkgRoot>/microsoft-rewards.exe).
    // However what we actually need is the *installed* portable directory
    // (where the user extracted the zip), not the caxa temp dir.
    //
    // Strategy: the launcher is invoked as  <pkgRoot>\microsoft-rewards.exe
    //           so process.execPath IS the .exe → dirname = pkgRoot.
    try {
        return path.dirname(fs.realpathSync(process.execPath))
    } catch {
        return path.dirname(fs.realpathSync(__filename))
    }
})()

const NODE_EXE     = path.join(PKG_ROOT, 'node.exe')
const INDEX_JS     = path.join(PKG_ROOT, 'dist', 'index.js')
const BROWSERS_DIR = path.join(PKG_ROOT, 'browsers')
const MODULES_DIR  = path.join(PKG_ROOT, 'node_modules')

// ─── Sanity checks ────────────────────────────────────────────────────────────
function abort(msg) {
    process.stderr.write(`\n[Microsoft-Rewards] ERROR: ${msg}\n\n`)
    process.exit(1)
}

if (!fs.existsSync(NODE_EXE)) {
    abort(`node.exe not found.\nExpected: ${NODE_EXE}\nThe package may be corrupted.`)
}
if (!fs.existsSync(INDEX_JS)) {
    abort(`dist\\index.js not found.\nExpected: ${INDEX_JS}\nThe package may be corrupted.`)
}
if (!fs.existsSync(MODULES_DIR)) {
    abort(`node_modules\\ not found.\nExpected: ${MODULES_DIR}\nThe package may be corrupted.`)
}

// ─── First-run: install Chromium ──────────────────────────────────────────────
if (!fs.existsSync(BROWSERS_DIR)) {
    const patchrightCli = path.join(MODULES_DIR, 'patchright', 'cli.js')
    if (!fs.existsSync(patchrightCli)) {
        abort(`patchright CLI not found.\nExpected: ${patchrightCli}`)
    }

    process.stdout.write(
        '\n[First Run] Downloading Chromium browser (~200 MB). This only happens once...\n\n'
    )

    const result = spawnSync(
        NODE_EXE,
        [patchrightCli, 'install', '--only-shell', 'chromium'],
        {
            stdio: 'inherit',
            env: {
                ...process.env,
                PLAYWRIGHT_BROWSERS_PATH: BROWSERS_DIR,
            },
        }
    )

    if (result.status !== 0) {
        abort('Chromium installation failed. Check the output above for details.')
    }

    process.stdout.write('\n[First Run] Chromium installed successfully.\n\n')
}

// ─── Launch the application ───────────────────────────────────────────────────
const env = {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: BROWSERS_DIR,
}

const args = [INDEX_JS, ...process.argv.slice(2)]

const result = spawnSync(NODE_EXE, args, {
    stdio: 'inherit',
    env,
    windowsHide: false,
})

process.exit(result.status ?? 1)
