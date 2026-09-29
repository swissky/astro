import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import vm from 'node:vm';
import partytown from '../../dist/index.js';

function getInjectedSnippet(): string {
	let snippet = '';
	const setup = partytown().hooks['astro:config:setup'] as (options: unknown) => void;
	setup({
		config: { base: '/' },
		command: 'build',
		injectScript: (_stage: string, content: string) => {
			snippet = content;
		},
	});
	return snippet;
}

/**
 * Runs the injected snippet against a minimal DOM whose `navigator.serviceWorker.register()`
 * fulfills with `registration`. Resolves after the registration callbacks have run.
 */
async function runSnippet(registration: unknown) {
	const result = { fallbackRan: false, error: undefined as unknown };
	const element = () => ({ style: {}, setAttribute() {} });
	const window: Record<string, unknown> = {
		crossOriginIsolated: false,
		addEventListener() {},
		setTimeout: () => 0,
		clearTimeout() {},
		console: { error() {} },
		MutationObserver: class {
			observe() {
				result.fallbackRan = true;
			}
		},
		document: {
			readyState: 'complete',
			querySelectorAll: () => [],
			querySelector: () => ({ appendChild() {} }),
			addEventListener() {},
			createElement: element,
			head: { appendChild() {} },
			documentElement: {},
		},
		navigator: { serviceWorker: { register: async () => registration } },
	};
	window.window = window;
	window.top = window;
	const onUnhandledRejection = (error: unknown) => {
		result.error = error;
	};
	process.once('unhandledRejection', onUnhandledRejection);
	vm.runInContext(getInjectedSnippet(), vm.createContext(window));
	await new Promise((resolve) => setTimeout(resolve, 10));
	process.off('unhandledRejection', onUnhandledRejection);
	return result;
}

describe('partytown snippet', () => {
	it('falls back immediately when serviceWorker.register() fulfills with undefined', async () => {
		const { fallbackRan, error } = await runSnippet(undefined);
		assert.equal(error, undefined);
		assert.equal(fallbackRan, true);
	});

	it('does not fall back when the service worker registration is active', async () => {
		const { fallbackRan, error } = await runSnippet({ active: {} });
		assert.equal(error, undefined);
		assert.equal(fallbackRan, false);
	});
});
