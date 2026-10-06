// Production build: type-check (tsc -p tsconfig.build.json) then bundle src/server.ts with esbuild.
// @crm/contracts ships as TypeScript source, so it is bundled in; every npm dependency stays
// external and is resolved from node_modules at runtime (`node dist/server.js`).
import { build } from 'esbuild';

await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
  plugins: [
    {
      name: 'externalize-npm-deps',
      setup(b) {
        // Bare imports (not relative, not @crm/*) stay external.
        b.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith('@crm/')) return undefined;
          return { path: args.path, external: true };
        });
      },
    },
  ],
});
