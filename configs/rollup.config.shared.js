import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import typescript from 'rollup-plugin-typescript2';

/**
 * Create shared Rollup configuration for packages
 * @param {string} packageDir - Path to package directory (e.g., 'packages/core')
 * @param {Object} options - Additional options
 * @param {string[]} options.external - External dependencies (peer dependencies)
 * @returns {import('rollup').RollupOptions}
 */
export function createRollupConfig(packageDir, options = {}) {
  const { external = [] } = options;

  return {
    input: `${packageDir}/src/index.ts`,
    output: {
      file: `${packageDir}/dist/index.js`,
      format: 'esm',
      sourcemap: true,
    },
    plugins: [
      resolve({
        preferBuiltins: false,
      }),
      commonjs(),
      json(),
      typescript({
        tsconfig: `${packageDir}/tsconfig.json`,
        useTsconfigDeclarationDir: false,
        tsconfigOverride: {
          compilerOptions: {
            declaration: false,
            declarationMap: false,
            emitDeclarationOnly: false,
          },
        },
      }),
    ],
    external: [
      // Peer dependencies should be external
      /@bridge-kit\/.*/,
      ...external,
    ],
  };
}
