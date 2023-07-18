import type { Options as SwupOptions, Handler } from 'swup';
import { nextTick } from 'swup';
import Plugin from '@swup/plugin';

declare module 'swup' {
	export interface AnimationContext {
		/** Parallel visit: run in and out animation at the same time */
		parallel?: boolean;
	}
}

type PluginOptions = {
	containers: SwupOptions['containers'];
};

type ContainerSet = {
	previous: HTMLElement;
	next: HTMLElement;
};

export default class SwupParallelPlugin extends Plugin {
	name = 'SwupParallelPlugin';

	requires = { swup: '>=4' };

	defaults: PluginOptions = {
		containers: []
	};
	options: PluginOptions;

	originalContainers: SwupOptions['containers'] = [];
	previousContainers: Element[] = [];
	nextContainers: Element[] = [];

	constructor(options: Partial<PluginOptions> = {}) {
		super();
		this.options = { ...this.defaults, ...options };
	}

	mount() {
		// No containers passed? Use all content containers
		if (!this.options.containers.length) {
			this.options.containers = this.swup.options.containers;
		}

		// On visit: check for containers and mark as parallel visit
		this.swup.hooks.on('visit:start', this.startVisit, { priority: 1 });
		// When awaiting animation: skip if not in animation phase
		this.swup.hooks.replace('animation:await', this.maybeSkipAnimation);
		// Before content replace: insert new containers
		this.swup.hooks.before('content:replace', this.insertContainers);
		// After content replace: reset containers in context object
		this.swup.hooks.on('content:replace', this.resetContainers);
		// After visit: remove old containers
		this.swup.hooks.on('visit:end', this.cleanupContainers);
	}

	unmount() {
		this.swup.hooks.off('visit:start', this.startVisit);
		this.swup.hooks.off('animation:await', this.maybeSkipAnimation);
		this.swup.hooks.off('content:replace', this.insertContainers);
		this.swup.hooks.off('content:replace', this.resetContainers);
		this.swup.hooks.off('visit:end', this.cleanupContainers);
	}

	startVisit: Handler<'visit:start'> = (context) => {
		const { animate, parallel } = context.animation;
		const { containers } = this.options;
		if (!animate || parallel === false) {
			console.log('Not animated or parallel disabled');
			return;
		}

		// Only mark as parallel visit if containers found
		const hasContainers = containers.some((selector) => document.querySelector(selector));
		console.log('Checking for parallel containers', hasContainers, containers);
		if (hasContainers) {
			context.animation.wait = true;
			context.animation.parallel = true;
		}
	};

	maybeSkipAnimation: Handler<'animation:await'> = (context, args, defaultHandler) => {
		const { animate, parallel } = context.animation;
		const { direction } = args;
		const isAnimationPhase = 'in' === direction;
		if (animate && parallel && !isAnimationPhase) {
			return Promise.resolve();
		}
		return defaultHandler?.(context, args);
	};

	insertContainers: Handler<'content:replace'> = (context, args) => {
		const { animate, parallel } = context.animation;
		const { containers } = context;
		const { page } = args;

		if (!animate || !parallel) {
			return;
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
			return;
		}

		// Replace parallel containers ourselves

		const parallelContainers = this.parseContainers(page);
		parallelContainers.forEach(({ previous, next }) => {
			this.previousContainers.push(previous);
			this.nextContainers.push(next);

			previous.setAttribute('aria-hidden', 'true');
			previous.before(next);

			next.classList.add('is-next-container');
			this.forceReflow(next);
			next.classList.remove('is-next-container');
			previous.classList.add('is-previous-container');
		});

		console.log('containersInParallel', containersInParallel);
		console.log('containersInSeries', containersInSeries);
		console.log('parallelContainers', parallelContainers);

		this.originalContainers = defaultContainers;
		context.containers = containersInSeries;
	};

	resetContainers: Handler<'content:replace'> = (context) => {
		const { animate, parallel } = context.animation;
		if (!animate || !parallel) {
			return;
		}

		context.containers = this.originalContainers;
	};

	cleanupContainers = () => {
		this.previousContainers.forEach((c) => c.remove());
		this.previousContainers = [];
		this.nextContainers.forEach((c) => c.classList.remove('is-next-container'));
		this.nextContainers = [];
	};

	parseContainers({ html }: { html: string }): ContainerSet[] {
		const incomingDocument = new DOMParser().parseFromString(html, 'text/html');
		return this.options.containers
			.reduce((containers, selector: string) => {
				const previous = document.querySelector<HTMLElement>(selector);
				const next = incomingDocument.querySelector<HTMLElement>(selector);
				return previous && next ? [...containers, { previous, next }] : containers;
			}, [] as ContainerSet[]);
	}

	forceReflow(element?: HTMLElement) {
		element = element || document.body;
		return element?.offsetHeight;
	}
}
