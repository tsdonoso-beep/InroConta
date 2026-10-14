/**
 * Guard of the boundaries of the web app's hexagonal architecture + DDD, the same rules as
 * GRAMA's: every dependency points inward, and a bounded context only shows its published
 * interface. `pnpm depcruise`; part of `pnpm check`.
 *
 *   src/modules/<context>/domain          pure: entities and policies, no framework, no I/O
 *   src/modules/<context>/application     use cases and the ports they need (+ views.ts, the
 *                                         read model and pure functions the browser may use)
 *   src/modules/<context>/infrastructure  the adapters behind the ports (Sheets, Supabase)
 *   src/modules/<context>/composition.ts  wires adapters to use cases: what src/app calls
 */
module.exports = {
  forbidden: [
    {
      name: 'domain-no-outward',
      comment: 'The domain is PURE: it does not import infrastructure, application, Next, Supabase, Google or React.',
      severity: 'error',
      from: { path: 'src/modules/[^/]+/domain' },
      to: {
        path: [
          'node_modules/(next|next-auth|@supabase|googleapis|react|react-dom|neverthrow)',
          'src/modules/[^/]+/(infrastructure|application|composition)',
          'src/app',
          'src/shared/(auth|google|supabase)',
        ],
      },
    },
    {
      name: 'application-no-infra',
      comment: 'The application orchestrates the domain through PORTS; it does not import adapters.',
      severity: 'error',
      from: { path: 'src/modules/[^/]+/application' },
      to: { path: ['src/modules/[^/]+/(infrastructure|composition)', 'src/shared/(auth|google|supabase)', 'node_modules/(next|@supabase|googleapis)'] },
    },
    {
      name: 'app-only-application',
      comment: 'src/app (Next presentation) talks to a context through composition.ts or application/, never domain/ or infrastructure/ directly.',
      severity: 'error',
      from: { path: '^src/app' },
      to: { path: 'src/modules/[^/]+/(domain|infrastructure)' },
    },
    {
      name: 'contexts-isolated',
      comment: 'A bounded context does not import the internals of another one, only its application/ or composition.',
      severity: 'error',
      from: { path: 'src/modules/([^/]+)/' },
      to: { path: 'src/modules/(?!\\1)[^/]+/(domain|infrastructure)' },
    },
    {
      name: 'shared-lib-no-app',
      comment: 'src/shared/lib is shared with the robots (scripts/): it knows nothing of the web app.',
      severity: 'error',
      from: { path: 'src/shared/lib' },
      to: { path: ['src/app', 'src/modules', 'src/shared/(auth|ui)', 'node_modules/(next|react)'] },
    },
    {
      name: 'no-circular',
      comment: 'No circular dependencies.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { extensions: ['.ts', '.tsx', '.js', '.mjs'] },
    exclude: { path: '\\.(gs|html)$' },
  },
};
