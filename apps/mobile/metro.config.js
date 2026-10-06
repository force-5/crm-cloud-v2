/* eslint-disable @typescript-eslint/no-require-imports -- Metro loads this file as CommonJS */
// Learn more: https://docs.expo.dev/guides/monorepos/
// Since SDK 52, `expo/metro-config` configures monorepos automatically (watchFolders = workspace
// root, nodeModulesPaths = app + root node_modules). We only make that explicit here so the
// workspace packages (raw .ts via `exports` → ./src/index.ts) are always watched and resolved.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.watchFolders = Array.from(new Set([...(config.watchFolders ?? []), workspaceRoot]));
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Workspace packages publish TypeScript through package.json `exports`.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
