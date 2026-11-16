// Next 16 on Windows can throw UNKNOWN (-4094) while opening
// .next/dev/types/routes.d.ts and then exit. Retry that write, and do not
// treat a failed startup write as fatal.
import fs from 'node:fs'

const marker = 'writeFileRetryWindows'

const targets = [
  {
    file: 'node_modules/next/dist/server/lib/router-utils/route-types-utils.js',
    write: '_fs.default.promises.writeFile',
    helper: `async function writeFileRetryWindows(filePath, contents) {
    let last;
    for (let attempt = 0; attempt < 8; attempt++) {
        try {
            await __REAL_WRITE__(filePath, contents);
            return;
        } catch (err) {
            last = err;
            const code = err && err.code;
            if (attempt === 7 || !['UNKNOWN', 'EBUSY', 'EPERM', 'EACCES'].includes(code)) throw err;
            await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
        }
    }
    throw last;
}
`,
    real: '_fs.default.promises.writeFile',
  },
  {
    file: 'node_modules/next/dist/esm/server/lib/router-utils/route-types-utils.js',
    write: 'fs.promises.writeFile',
    helper: `async function writeFileRetryWindows(filePath, contents) {
    let last;
    for (let attempt = 0; attempt < 8; attempt++) {
        try {
            await __REAL_WRITE__(filePath, contents);
            return;
        } catch (err) {
            last = err;
            const code = err && err.code;
            if (attempt === 7 || !['UNKNOWN', 'EBUSY', 'EPERM', 'EACCES'].includes(code)) throw err;
            await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
        }
    }
    throw last;
}
`,
    real: 'fs.promises.writeFile',
  },
]

for (const target of targets) {
  if (!fs.existsSync(target.file)) continue
  let text = fs.readFileSync(target.file, 'utf8')
  if (!text.includes(marker)) {
    const exported = 'export async function writeRouteTypesManifest'
    const fn = text.includes(exported)
      ? exported
      : 'async function writeRouteTypesManifest'
    if (!text.includes(fn)) continue
    text = text.replace(fn, `${target.helper}${fn}`)
    text = text.replaceAll(`${target.write}(`, 'writeFileRetryWindows(')
    text = text.replace('__REAL_WRITE__', target.real)
    fs.writeFileSync(target.file, text)
  }
}

const startups = [
  {
    file: 'node_modules/next/dist/server/lib/router-utils/setup-dev-bundler.js',
    from: `    await (0, _routetypesutils.writeRouteTypesManifest)({`,
    to: `    try { await (0, _routetypesutils.writeRouteTypesManifest)({`,
    end: `    }, _path.default.join(distTypesDir, 'routes.d.ts'), opts.nextConfig);
    const routesManifestPath`,
    endTo: `    }, _path.default.join(distTypesDir, 'routes.d.ts'), opts.nextConfig);
    } catch (err) { console.warn('[next] route types write failed, continuing', err && err.message); }
    const routesManifestPath`,
  },
  {
    file: 'node_modules/next/dist/esm/server/lib/router-utils/setup-dev-bundler.js',
    from: `    await writeRouteTypesManifest({`,
    to: `    try { await writeRouteTypesManifest({`,
    end: `    }, path.join(distTypesDir, 'routes.d.ts'), opts.nextConfig);
    const routesManifestPath`,
    endTo: `    }, path.join(distTypesDir, 'routes.d.ts'), opts.nextConfig);
    } catch (err) { console.warn('[next] route types write failed, continuing', err && err.message); }
    const routesManifestPath`,
  },
]

for (const item of startups) {
  if (!fs.existsSync(item.file)) continue
  let text = fs.readFileSync(item.file, 'utf8')
  if (text.includes('route types write failed, continuing')) continue
  if (!text.includes(item.from) || !text.includes(item.end)) {
    console.warn('skip startup wrap, pattern missing:', item.file)
    continue
  }
  text = text.replace(item.from, item.to)
  text = text.replace(item.end, item.endTo)
  fs.writeFileSync(item.file, text)
}
