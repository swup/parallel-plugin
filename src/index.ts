import type { Options as SwupOptions, Handler } from 'swup';
import { nextTick } from 'swup';
import Plugin from '@swup/plugin';

type PluginOptions = {
	containers: SwupOptions['containers'];
	animationPhase: 'in' | 'out';
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
		containers: ['#swup'],
		animationPhase: 'in'
	};
	options: PluginOptions;

	previousContainers: Element[] = [];
	nextContainers: Element[] = [];

	constructor(options: Partial<PluginOptions> = {}) {
		super();
		this.options = { ...this.defaults, ...options };
		if (!['in', 'out'].includes(this.options.animationPhase)) {
			this.options.animationPhase = 'in';
		}
	}

	mount() {
		this.swup.hooks.before('visit:start', this.startVisit);
		this.swup.hooks.on('visit:start', this.prepareVisit);
		this.swup.hooks.replace('animation:await', this.maybeSkipAnimation);
		this.swup.hooks.replace('content:replace', this.insertContainers);
		this.swup.hooks.on('visit:end', this.cleanupContainers);
	}

	unmount() {
		this.swup.hooks.off('visit:start', this.startVisit);
		this.swup.hooks.off('visit:start', this.prepareVisit);
		this.swup.hooks.off('animation:await', this.maybeSkipAnimation);
		this.swup.hooks.off('content:replace', this.insertContainers);
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

		context.containers = containersInSeries;
		await defaultHandler?.(context, args);
		context.containers = defaultContainers;
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
			.map((selector) => {
				const previous = document.querySelector(selector);
				const next = incomingDocument.querySelector(selector);
				return previous && next ? { previous, next } : false;
			})
			.filter(isTruthy);
	}
}
