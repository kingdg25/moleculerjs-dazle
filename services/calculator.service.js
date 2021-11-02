"use strict";

/**
 * @typedef {import('moleculer').Context} Context Moleculer's Context
 */

module.exports = {
	name: "calculator",

	/**
	 * Settings
	 */
	settings: {

	},

	/**
	 * Dependencies
	 */
	dependencies: [],

	/**
	 * Actions
	 */
	actions: {
		/**
		 * Add a number1 and number2
		 *
		 * @param {Number} number1 - number 1
         * @param {Number} number2 - number 2
		 */
		add: {
			rest: "/add",
			params: {
				number1: "number",
                number2: "number"
			},
			/** @param {Context} ctx  */
			async handler(ctx) {
				return ctx.params.number1 + ctx.params.number2;
			}
		}
	},

	/**
	 * Events
	 */
	events: {

	},

	/**
	 * Methods
	 */
	methods: {

	},

	/**
	 * Service created lifecycle event handler
	 */
	created() {

	},

	/**
	 * Service started lifecycle event handler
	 */
	async started() {

	},

	/**
	 * Service stopped lifecycle event handler
	 */
	async stopped() {

	}
};
