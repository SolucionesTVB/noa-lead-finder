import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['*'],
    },
  },

  // Monorepo fix: fuerza a Next/Turbopack a usar ESTE directorio como root
  turbopack: {
    root: __dirname,
  },

  output: 'standalone',
}

export default nextConfig
