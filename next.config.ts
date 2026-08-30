import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  // Lets the exe.dev HTTPS proxy (vmname.exe.xyz:<port>) load dev chunks.
  allowedDevOrigins: ["codex-dev.exe.xyz"],
};

export default nextConfig;
