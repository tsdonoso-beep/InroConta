import type { NextConfig } from 'next';

// The INROCONTA web app (src/app). The robots (scripts/) and the Apps Script projects
// (apps-script/) live in the same repository and are not part of the build.
const nextConfig: NextConfig = {
    // googleapis is large and only used on the server: leave it out of the bundle.
    serverExternalPackages: ['googleapis'],
    // No AGENTS.md at the root: the repository already has CLAUDE.md and docs/.
    agentRules: false,
    experimental: {
        // The router keeps a visited page for this long (s): going back to it is instant. GRAMA's values.
        staleTimes: { dynamic: 30, static: 300 },
    },
};

export default nextConfig;
