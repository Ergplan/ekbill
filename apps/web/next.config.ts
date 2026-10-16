import { join } from 'node:path';

import type { NextConfig } from 'next';

/** Stamped at build so /api/health can say which build is serving. */
const BUILD_STAMP = new Date().toISOString();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BUILD_STAMP: BUILD_STAMP },
  // A self-contained server for the image: the app, not node_modules.
  output: 'standalone',
  // The monorepo root, so the standalone server carries the workspace packages it needs.
  outputFileTracingRoot: join(__dirname, '..', '..'),
  // Workspace packages are plain TypeScript; Next compiles them with the app.
  transpilePackages: [
    '@ekbill/ui',
    '@ekbill/copy',
    '@ekbill/engine',
    '@ekbill/db',
    '@ekbill/ai',
    '@ekbill/render',
    '@ekbill/design',
  ],
  // Chromium (PDF/JPEG rendering, Stage 6) and the database driver run in Node, outside the bundler.
  serverExternalPackages: ['playwright-core', 'pg', 'pino', 'qrcode', 'pg-boss'],
  devIndicators: false,
  // The tests and the VM reach the dev server by IP; without this, Next refuses their chunk requests and nothing hydrates.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
    // Every request passes the proxy (request id, rate limits), which buffers its body up to this and cuts the
    // rest: an import (36 MB at most, imports.ts) and a photo (8 MB) must fit, with the multipart framing.
    proxyClientMaxBodySize: '40mb',
  },
};

export default nextConfig;
