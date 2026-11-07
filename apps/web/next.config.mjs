/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  env: {
    NEXT_PUBLIC_AGENT_URL: process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:4000",
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4000",
    NEXT_PUBLIC_API_SECRET: process.env.API_SECRET ?? "",
  },
};

export default nextConfig;
