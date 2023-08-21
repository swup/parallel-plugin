import type { Handler, PageData, Visit } from 'swup';
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
	keep: number;
};

type ContainerSet = {
	selector: string;
	next: HTMLElement;
	previous: HTMLElement;
	keep: HTMLElement[];
	remove: HTMLElement[];
	all: HTMLElement[];
};

export default class SwupParallelPlugin extends Plugin {
	name = 'SwupParallelPlugin';

	requires = { swup: '>=4' };

	defaults: PluginOptions = {
		containers: [],
		keep: 0
	};

	options: PluginOptions;

	originalContainers: string[] | null = null;
	parallelContainers: ContainerSet[] = [];

	constructor(options: Partial<PluginOptions> = {}) {
		super();
		this.options = { ...this.defaults, ...options };
		this.options.keep = Math.max(0, this.options.keep);
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

		// Get info about parallel containers
		this.parallelContainers = this.getParallelContainerForVisit(visit, page);

		// Replace parallel containers ourselves
		for (const { all, next, previous, keep, remove } of this.parallelContainers) {
			all.forEach((el, i) => el.style.setProperty('--swup-parallel-container', `${i}`));
			previous.setAttribute('aria-hidden', 'true');
			previous.before(next);

			if (visit.animation.animate) {
				next.classList.add('is-next-container');
				forceReflow(next);
				next.classList.remove('is-next-container');
			}

			previous.classList.add('is-previous-container');
			keep.forEach((el) => el.classList.add('is-kept-container'));
			remove.forEach((el) => el.classList.add('is-removing-container'));
		}

		// Modify visit containers so swup will only replace non-parallel containers
		this.originalContainers = visit.containers;
		const parallelSelectors = this.parallelContainers.map(({ selector }) => selector);
		visit.containers = visit.containers.filter((s) => !parallelSelectors.includes(s));
	};

	resetContainers: Handler<'content:replace'> = (visit) => {
		if (this.originalContainers) {
			visit.containers = this.originalContainers;
		}
	};

	cleanupContainers = () => {
		for (const { remove, next } of this.parallelContainers) {
			remove.forEach((el) => el.remove());
			next.classList.remove('is-next-container');
		}
		this.parallelContainers = [];
	};

	getParallelContainerForVisit(visit: Visit, { html }: PageData): ContainerSet[] {
		const { containers: parallelContainers } = this.options;

		const containersInVisit = parallelContainers.filter((s) => visit.containers.includes(s));
		if (!containersInVisit.length) {
			console.warn('No parallel containers found in list of replaced containers');
			return [];
		}

		const incomingDocument = new DOMParser().parseFromString(html, 'text/html');

		return containersInVisit.reduce((containers, selector: string) => {
			const next = incomingDocument.querySelector<HTMLElement>(selector);
			const previousAll = Array.from(document.querySelectorAll<HTMLElement>(selector));
			const previous = previousAll[0];
			const keep = previousAll.slice(0, this.options.keep);
			const remove = previousAll.slice(this.options.keep);
			const all = [...new Set([next!, previous, ...keep, ...remove])];
			if (next && previous) {
				return [...containers, { selector, next, previous, keep, remove, all }];
			} else {
				console.warn(`Parallel container ${selector} not found`);
				return containers;
			}
		}, [] as ContainerSet[]);
	}

	isParallelVisit(visit: Visit) {
		return visit.animation.parallel;
	}

	markVisitAsParallelAnimation(visit: Visit) {
		visit.animation.wait = true;
		visit.animation.parallel = true;
	}

	visitHasPotentialParallelAnimation(visit: Visit) {
		// Checking for visit.animation.parallel !== false here allows explicitly
		// disabling parallel animations in user hooks before this plugin executes
		return (
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
