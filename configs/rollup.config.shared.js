import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import typescript from '@rollup/plugin-typescript';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'module';
import { gzipSync } from 'node:zlib';

const formatSize = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

function reportBundleSize(packageDir) {
  return {
    name: 'report-bundle-size',
    async writeBundle(outputOptions) {
      const [bundle, packageJson] = await Promise.all([
        readFile(outputOptions.file),
        readFile(`${packageDir}/package.json`, 'utf8'),
      ]);
      const { name } = JSON.parse(packageJson);

      console.log(
        `${name} dist/index.js: raw ${formatSize(bundle.length)} | gzip ${formatSize(gzipSync(bundle).length)}`
      );
    },
  };
}

const require = createRequire(import.meta.url);
const tslibPath = require.resolve('tslib/tslib.es6.js');

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
        tslib: tslibPath,
        compilerOptions: {
          declaration: false,
          declarationMap: false,
          emitDeclarationOnly: false,
        },
      }),
      reportBundleSize(packageDir),
    ],
    external: [
      // Peer dependencies should be external
      /@bridge-kit\/.*/,
      ...external,
    ],
  };
}
