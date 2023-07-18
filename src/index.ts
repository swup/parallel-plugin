import type { Options as SwupOptions, Handler } from 'swup';
import { nextTick } from 'swup';
import Plugin from '@swup/plugin';

declare module 'swup' {
	export interface AnimationContext {
		parallel?: boolean;
	}
}

type PluginOptions = {
	containers: SwupOptions['containers'];
	animationPhase: 'in' | 'out';
};

type ContainerSet = {
	previous: Element;
	next: Element;
};

export default class SwupParallelPlugin extends Plugin {
	name = 'SwupParallelPlugin';

	requires = { swup: '>=4' };

	defaults: PluginOptions = {
		containers: ['#swup'],
		animationPhase: 'out'
	};
	options: PluginOptions;

	originalContainers: SwupOptions['containers'] = [];
	previousContainers: Element[] = [];
	nextContainers: Element[] = [];

	constructor(options: Partial<PluginOptions> = {}) {
		super();
		this.options = { ...this.defaults, ...options };
		if (!['in', 'out'].includes(this.options.animationPhase)) {
			this.options.animationPhase = 'out';
		}
	}

	mount() {
		this.swup.hooks.before('visit:start', this.startVisit);
		this.swup.hooks.on('visit:start', this.prepareVisit, { priority: 1 });
		this.swup.hooks.replace('animation:await', this.maybeSkipAnimation);
		this.swup.hooks.before('content:replace', this.insertContainers);
		this.swup.hooks.on('content:replace', this.resetContainers);
		this.swup.hooks.on('visit:end', this.cleanupContainers);
	}

	unmount() {
		this.swup.hooks.off('visit:start', this.startVisit);
		this.swup.hooks.off('visit:start', this.prepareVisit);
		this.swup.hooks.off('animation:await', this.maybeSkipAnimation);
		this.swup.hooks.off('content:replace', this.insertContainers);
		this.swup.hooks.off('content:replace', this.resetContainers);
		this.swup.hooks.off('visit:end', this.cleanupContainers);
	}

	startVisit: Handler<'visit:start'> = (context) => {
		context.animation.parallel = true;
	};

	prepareVisit: Handler<'visit:start'> = (context) => {
		const { animate, parallel } = context.animation;
		if (animate && parallel) {
			context.animation.wait = true;
		}
	};

	maybeSkipAnimation: Handler<'animation:await'> = (context, args, defaultHandler) => {
		const { animate, parallel } = context.animation;
		const { direction } = args;
		const isAnimationPhase = this.options.animationPhase === direction;
		console.log('isAnimationPhase?', isAnimationPhase, this.options.animationPhase, direction);
		if (animate && parallel && isAnimationPhase) {
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
			previous.classList.add('is-previous-container');
			next.classList.add('is-next-container');

			previous.before(next);

			nextTick().then(() => next.classList.remove('is-next-container'));
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
				const previous = document.querySelector(selector);
				const next = incomingDocument.querySelector(selector);
				return previous && next ? [...containers, { previous, next }] : containers;
			}, [] as ContainerSet[]);
	}
}
