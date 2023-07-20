import type { Options as SwupOptions, Handler } from 'swup';
import { forceReflow } from 'swup';
import Plugin from '@swup/plugin';

declare module 'swup' {
	export interface VisitAnimation {
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
		// Run after user hooks to allow disabling parallel animations beforehand
		this.on('visit:start', this.startVisit, { priority: 1 });
		// Before awaiting out animation: skip
		this.before('animation:out:await', this.skipOutAnimation, { priority: 1 });
		// Before content replace: insert new containers
		this.before('content:replace', this.insertContainers, { priority: 1 });
		// After content replace: reset containers
		this.on('content:replace', this.resetContainers);
		// After visit: remove old containers
		this.on('visit:end', this.cleanupContainers);
	}

	startVisit: Handler<'visit:start'> = (visit) => {
		const { animate, parallel } = visit.animation;
		const { containers } = this.options;
		if (!animate || parallel === false) {
			return;
		}

		// Only mark as parallel visit if containers found
		const hasContainers = containers.some((selector) => document.querySelector(selector));
		if (hasContainers) {
			visit.animation.wait = true;
			visit.animation.parallel = true;
		}
	};

	skipOutAnimation: Handler<'animation:out:await'> = (visit, args) => {
		const { animate, parallel } = visit.animation;
		if (animate && parallel) {
			args.skip = true;
		}
	};

	insertContainers: Handler<'content:replace'> = (visit, args) => {
		const { animate, parallel } = visit.animation;
		const { containers } = visit;
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
			forceReflow(next);
			next.classList.remove('is-next-container');
			previous.classList.add('is-previous-container');
		});

		this.originalContainers = defaultContainers;
		visit.containers = containersInSeries;
	};

	resetContainers: Handler<'content:replace'> = (visit) => {
		const { animate, parallel } = visit.animation;
		if (!animate || !parallel) {
			return;
		}

		visit.containers = this.originalContainers;
	};

	cleanupContainers = () => {
		this.previousContainers.forEach((c) => c.remove());
		this.previousContainers = [];
		this.nextContainers.forEach((c) => c.classList.remove('is-next-container'));
		this.nextContainers = [];
	};

	parseContainers({ html }: { html: string }): ContainerSet[] {
		const incomingDocument = new DOMParser().parseFromString(html, 'text/html');
		return this.options.containers.reduce((containers, selector: string) => {
			const previous = document.querySelector<HTMLElement>(selector);
			const next = incomingDocument.querySelector<HTMLElement>(selector);
			return previous && next ? [...containers, { previous, next }] : containers;
		}, [] as ContainerSet[]);
	}
}
