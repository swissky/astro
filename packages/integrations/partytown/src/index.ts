import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PartytownConfig } from '@qwik.dev/partytown/integration';
import { partytownSnippet } from '@qwik.dev/partytown/integration';
import { copyLibFiles, libDirPath } from '@qwik.dev/partytown/utils';
import type { AstroIntegration } from 'astro';
import sirv from './sirv.js';

const resolve = createRequire(import.meta.url).resolve;

export type PartytownOptions = {
	config?: PartytownConfig;
};

function appendForwardSlash(str: string) {
	return str.endsWith('/') ? str : str + '/';
}

// The upstream snippet reads `.active` on whatever `navigator.serviceWorker.register()` fulfills
// with. Some environments (e.g. Playwright with `serviceWorkers: 'block'`) fulfill with
// `undefined`, which throws instead of falling back to running scripts on the main thread.
// The guard sends a missing registration to `fallback()` (`w`), like a rejected `register()` does.
// https://github.com/withastro/astro/issues/18171
const unguardedRegistrationCallback =
	'.then((function(t){t.active?v():t.installing&&t.installing.addEventListener("statechange",(function(t){"activated"==t.target.state&&v()}))}),(function(t){console.error(t),w()}))';
const guardedRegistrationCallback =
	'.then((function(t){if(!t)return w();t.active?v():t.installing&&t.installing.addEventListener("statechange",(function(t){"activated"==t.target.state&&v()}))}),(function(t){console.error(t),w()}))';

export default function createPlugin(options?: PartytownOptions): AstroIntegration {
	let partytownSnippetHtml: string;
	const partytownEntrypoint = resolve('@qwik.dev/partytown/package.json');
	const partytownLibDirectory = path.resolve(partytownEntrypoint, '../lib');
	return {
		name: '@astrojs/partytown',
		hooks: {
			'astro:config:setup': ({ config: _config, command, injectScript }) => {
				const lib = `${appendForwardSlash(_config.base)}~partytown/`;
				const recreateIFrameScript = `;(e=>{e.addEventListener("astro:before-swap",e=>{let r=document.body.querySelector("iframe[src*='${lib}']");if(r)e.newDocument.body.append(r)})})(document);`;
				const partytownConfig = {
					lib,
					...options?.config,
					debug: options?.config?.debug ?? command === 'dev',
				};
				partytownSnippetHtml = partytownSnippet(partytownConfig).replace(
					unguardedRegistrationCallback,
					guardedRegistrationCallback,
				);
				partytownSnippetHtml += recreateIFrameScript;
				injectScript('head-inline', partytownSnippetHtml);
			},
			'astro:server:setup': ({ server }) => {
				const lib = options?.config?.lib ?? `/~partytown/`;
				server.middlewares.use(
					sirv(partytownLibDirectory, {
						mount: lib,
						dev: true,
						etag: true,
						extensions: [],
					}),
				);
			},
			'astro:build:done': async ({ dir }) => {
				await copyLibFiles(
					fileURLToPath(new URL(options?.config?.lib?.replace(/^\/?/, '') ?? '~partytown', dir)),
					{
						debugDir: options?.config?.debug ?? false,
					},
				);
			},
			'astro:build:ssr': async ({ manifest }) => {
				const dirpath = libDirPath({ debugDir: false });
				const files = await fs.promises.readdir(dirpath);
				for (const file of files) {
					if (file === 'debug') continue;
					manifest.assets.push(`/~partytown/${file}`);
				}
			},
		},
	};
}
