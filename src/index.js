import Plugin from '@swup/plugin';

export default class SwupParallelPlugin extends Plugin {
	name = 'SwupParallelPlugin';

	requires = { swup: '>=4' };

	preloadPromises = new Map();

	defaults = {
		containers: ['#swup']
	};

	previousContainers = [];
	nextContainers = [];

	constructor(options = {}) {
		super();
		this.options = { ...this.defaults, ...options };
	}

	mount() {
		this.swup.hooks.before('transitionStart', this.prepareTransition);
		this.swup.hooks.on('transitionStart', this.validateTransition);
		this.swup.hooks.replace('awaitAnimation', this.skipOutAnimation);
		this.swup.hooks.replace('replaceContent', this.insertContainers);
		this.swup.hooks.on('transitionEnd', this.cleanupContainers);
	}

	unmount() {
		this.swup.hooks.off('transitionStart', this.prepareTransition);
		this.swup.hooks.off('transitionStart', this.validateTransition);
		this.swup.hooks.off('awaitAnimation', this.skipOutAnimation);
		this.swup.hooks.off('replaceContent', this.insertContainers);
		this.swup.hooks.off('transitionEnd', this.cleanupContainers);
	}

	prepareTransition(context) {
		context.transition.parallel = true;
	}

	validateTransition = (context) => {
		const { animate, parallel } = context.transition;
		if (animate && parallel) {
			context.transition.wait = true;
		}
	}

	skipOutAnimation = (context, args, originalHandler) => {
		const { animate, parallel } = context.transition;
		const { direction } = args;
		if (animate && parallel && direction === 'out') {
			return Promise.resolve();
		} else {
			return originalHandler(context, args);
		}
	}

	insertContainers = async (context, args, originalHandler) => {
		const abort = () => originalHandler(context, args);

		const { animate, parallel } = context.transition;
		const { page, containers } = args;

		if (!animate || !parallel) {
			return abort();
		}

		const defaultContainers = containers;
		const containersInParallel = this.options.containers;
		const containersInSeries = defaultContainers.filter((c) => !containersInParallel.includes(c));
		const hasContainers = containersInParallel.every((c) => defaultContainers.includes(c));
		if (!hasContainers) {
			console.warn('Parallel containers must be included in default containers');
			return abort();
		}

		const parallelContainers = this.parseContainers(page);

		// Replace parallel containers ourselves
		parallelContainers.forEach(({ previous, next, wrapper }) => {
			previous.removeAttribute('id');
			previous.classList.add('is-previous-container');
			next.classList.add('is-next-container');
			next.scrollTop = previous.scrollTop;
			this.insertBefore(next, previous, wrapper);
			this.previousContainers.push(previous);
			this.nextContainers.push(next);
		});

		// Let swup handler replace series containers
		await originalHandler(context, { ...args, containers: containersInSeries });
	}

	cleanupContainers = () => {
		this.previousContainers.forEach((container) => {
			container.remove();
		});
		this.nextContainers.forEach((container) => {
			container.classList.remove('is-next-container');
		});
		this.previousContainers = [];
	}

	parseContainers({ html }) {
		const newDocument = new DOMParser().parseFromString(html, 'text/html');
		return this.options.containers.map((selector) => {
			const previous = document.querySelector(selector);
			const next = newDocument.querySelector(selector);
			const wrapper = previous.parentNode;
			return { previous, next, wrapper };
		});
	}

	insertBefore(newNode, existingNode, newParent) {
		if (newParent.contains(existingNode)) {
			newParent.insertBefore(newNode, existingNode);
		} else {
			newParent.appendChild(newNode);
		}
	}
}
