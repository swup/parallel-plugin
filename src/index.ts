import type { Handler, Visit } from 'swup';
import { forceReflow } from 'swup';
import Plugin from '@swup/plugin';

declare module 'swup' {
	export interface VisitAnimation {
		/** Parallel visit: run in and out animation at the same time */
		parallel?: boolean;
	}
}

type PluginOptions = {
	containers: string[];
};

type ContainerSet = {
	selector: string;
	previous: HTMLElement;
	next: HTMLElement;
};

export default class SwupParallelPlugin extends Plugin {
	name = 'SwupParallelPlugin';

	requires = { swup: '>=4' };

	defaults: PluginOptions = { containers: [] };
	options: PluginOptions;

	originalContainers: string[] | null = null;
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
		this.originalContainers = null;

		// Only mark as parallel visit if containers found and animation matches
		if (this.visitHasPotentialParallelAnimation(visit)) {
			visit.animation.wait = true;
			visit.animation.parallel = true;
		}
	};

	skipOutAnimation: Handler<'animation:out:await'> = (visit, args) => {
		if (this.isParallelVisit(visit)) {
			args.skip = true;
		}
	};

	insertContainers: Handler<'content:replace'> = (visit, { page }) => {
		if (!this.isParallelVisit(visit)) {
			return;
		}

		// Replace parallel containers ourselves
		const containerSets = this.getContainersForVisit(visit, page);
		const parallelContainers = containerSets.map(({ selector }) => selector);
		containerSets.forEach(({ previous, next }) => {
			this.previousContainers.push(previous);
			this.nextContainers.push(next);

			previous.setAttribute('aria-hidden', 'true');
			previous.before(next);

			next.classList.add('is-next-container');
			forceReflow(next);
			previous.classList.add('is-previous-container');
			next.classList.remove('is-next-container');
		});

		// Hand all other non-parallel containers to swup
		this.originalContainers = visit.containers;
		visit.containers = visit.containers.filter((s) => !parallelContainers.includes(s));
	};

	resetContainers: Handler<'content:replace'> = (visit) => {
		if (this.originalContainers) {
			visit.containers = this.originalContainers;
		}
	};

	cleanupContainers = () => {
		this.previousContainers.forEach((c) => c.remove());
		this.nextContainers.forEach((c) => c.classList.remove('is-next-container'));
		this.previousContainers = [];
		this.nextContainers = [];
	};

	getContainersForVisit(visit: Visit, { html }: { html: string }): ContainerSet[] {
		const { containers: parallelContainers } = this.options;
		const containersInVisit = parallelContainers.filter((s) => visit.containers.includes(s));
		if (!containersInVisit.length) {
			console.warn('No parallel containers found in list of replaced containers');
			return [];
		}

		const incomingDocument = new DOMParser().parseFromString(html, 'text/html');

		return containersInVisit.reduce((containers, selector: string) => {
			const previous = document.querySelector<HTMLElement>(selector);
			const next = incomingDocument.querySelector<HTMLElement>(selector);
			return previous && next ? [...containers, { selector, previous, next }] : containers;
		}, [] as ContainerSet[]);
	}

	isParallelVisit(visit: Visit) {
		return visit.animation.animate && visit.animation.parallel;
	}

	markVisitAsParallelAnimation(visit: Visit) {
		visit.animation.wait = true;
		visit.animation.parallel = true;
	}

	visitHasPotentialParallelAnimation(visit: Visit) {
		// Checking for visit.animation.parallel !== false here allows explicitly
		// disabling parallel animations in user hooks before this plugin executes
		return (
			visit.animation.animate &&
			visit.animation.parallel !== false &&
			this.visitHasParallelContainers(visit)
		);
	}

	visitHasParallelContainers(visit: Visit) {
		return this.options.containers.some((selector) => {
			const container = document.querySelector(selector);
			return container?.matches(visit.containers.join(','));
		});
	}
}
