/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output: produces a self-contained `.next/standalone` folder
  // with only the deps the app actually imports. The Docker runtime image
  // copies that folder instead of `node_modules`, dropping size by ~5×.
  output: 'standalone',
  // Next.js 16: Turbopack is default — provide both configs
  turbopack: {
    resolveAlias: {
      // Prevent canvas from being bundled (react-pdf uses pdfjs which references canvas)
      canvas: './src/empty.js',
    },
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

module.exports = nextConfig;
