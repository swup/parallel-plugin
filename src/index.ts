import { nextTick } from 'swup';
import type { Options as SwupOptions, Handler } from 'swup';
import Plugin from '@swup/plugin';

type PluginOptions = {
	containers: SwupOptions['containers'];
};

type ContainerSet = {
	previous: Element;
	next: Element;
};

declare module 'swup' {
	export interface AnimationContext {
		parallel?: boolean;
	}
}

const isTruthy = <T>(x?: T | undefined | null | false): x is T => !!x;

export default class SwupParallelPlugin extends Plugin {
	name = 'SwupParallelPlugin';

	requires = { swup: '>=4' };

	defaults: PluginOptions = {
		containers: ['#swup']
	};
	options: PluginOptions;

	originalContainers: SwupOptions['containers'] = [];
	previousContainers: Element[] = [];
	nextContainers: Element[] = [];

	constructor(options?: Partial<PluginOptions>) {
		super();
		this.options = { ...this.defaults, ...options };
	}

	mount() {
		this.swup.hooks.before('visit:start', this.prepareTransition);
		this.swup.hooks.on('visit:start', this.validateTransition);
		this.swup.hooks.replace('animation:await', this.skipOutAnimation);
		this.swup.hooks.replace('content:replace', this.insertContainers);
		this.swup.hooks.on('content:replace', this.resetContainers, { priority: -100 });
		this.swup.hooks.on('visit:end', this.cleanupContainers);
	}

	unmount() {
		this.swup.hooks.off('visit:start', this.prepareTransition);
		this.swup.hooks.off('visit:start', this.validateTransition);
		this.swup.hooks.off('animation:await', this.skipOutAnimation);
		this.swup.hooks.off('content:replace', this.insertContainers);
		this.swup.hooks.off('content:replace', this.resetContainers);
		this.swup.hooks.off('visit:end', this.cleanupContainers);
	}

	prepareTransition: Handler<'visit:start'> = (context) => {
		context.animation.parallel = true;
	};

	validateTransition: Handler<'visit:start'> = (context) => {
		const { animate, parallel } = context.animation;
		if (animate && parallel) {
			context.animation.wait = true;
		}
	};

	skipOutAnimation: Handler<'animation:await'> = (context, args, defaultHandler) => {
		const { animate, parallel } = context.animation;
		const { direction } = args;
		if (animate && parallel && direction === 'out') {
			return Promise.resolve();
		}
		return defaultHandler?.(context, args);
	};

	insertContainers: Handler<'content:replace'> = async (context, args, defaultHandler) => {
		const abort = async () => await defaultHandler?.(context, args);
		const { animate, parallel } = context.animation;
		const { containers } = context;
		const { page } = args;

		if (!animate || !parallel) {
			return abort();
		}

		const defaultContainers = [...containers];
		const containersInParallel = this.options.containers;
		const containersInSeries = defaultContainers.filter(
			(selector) => !containersInParallel.includes(selector)
		);
		const hasContainers = containersInParallel.every((selector) =>
			defaultContainers.includes(selector)
		);
		if (!hasContainers) {
			console.warn(
				'[parallel-plugin] Parallel containers must be included in default containers'
			);
			return abort();
		}

		// Replace parallel containers ourselves

		const parallelContainers = this.parseContainers(page);
		parallelContainers.forEach(({ previous, next }) => {
			this.previousContainers.push(previous);
			this.nextContainers.push(next);

			previous.setAttribute('aria-hidden', 'true');
			previous.classList.add('is-previous-container');
			next.classList.add('is-next-container');

			previous.before(next);

			nextTick().then(() => next.classList.remove('is-next-container'));
		});

		if (containersInSeries) {
			context.containers = containersInSeries;
			defaultHandler?.(context, args);
			context.containers = defaultContainers;
		}
	};

	resetContainers: Handler<'content:replace'> = (context) => {
		context.containers = this.originalContainers;
	};

	cleanupContainers = () => {
		this.previousContainers.forEach((c) => c.remove());
		this.nextContainers.forEach((c) => c.classList.remove('is-next-container'));
		this.previousContainers = [];
	};

	parseContainers({ html }: { html: string }): ContainerSet[] {
		const incomingDocument = new DOMParser().parseFromString(html, 'text/html');
		return this.options.containers
			.map((selector) => {
				const previous = document.querySelector(selector);
				const next = incomingDocument.querySelector(selector);
				return previous && next ? { previous, next } : false;
			})
			.filter(isTruthy);
	}
}
