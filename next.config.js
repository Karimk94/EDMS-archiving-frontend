/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  basePath: '/PTAARCHIVING',
  env: {
    NEXT_PUBLIC_BASE_PATH: '/PTAARCHIVING',
  },
};

module.exports = nextConfig;