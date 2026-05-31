/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@trackstacc/ui", "@trackstacc/types"],
};

export default nextConfig;
