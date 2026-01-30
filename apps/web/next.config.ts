import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['*'],
    },
  },
  // evitar que el build intente prerender rutas que usan Supabase sin env
  output: 'standalone',
}

export default nextConfig
