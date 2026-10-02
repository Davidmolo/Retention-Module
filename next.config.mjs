import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname)

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  output: 'standalone',
  // Pin roots so Turbopack/dev does not treat `app/` as the project directory
  // (common on Windows when a parent folder also has Node projects).
  // Also keeps a single casing for the project path (grossprofit vs grossProfit),
  // which otherwise duplicates Next/React and throws "layout router to be mounted".
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  webpack: (config) => {
    config.context = projectRoot
    config.resolve = config.resolve || {}
    config.resolve.modules = [
      path.join(projectRoot, 'node_modules'),
      'node_modules',
    ]
    return config
  },
}

export default nextConfig
