"use strict";

const C = require("../constants");


const DbService = require("db-mixin");
const Cron = require("cron-mixin");
const CacheCleaner = require("cache-cleaner-mixin");
const ConfigLoader = require("config-mixin");

const { MoleculerClientError } = require("moleculer").Errors;

/**
 * attachments of addons service
 */
module.exports = {
	name: "repos.commits",
	version: 1,

	mixins: [
		DbService({
			cache: {
				additionalKeys: ["repo", "#userID"]
			},
			collection: 'repos.commits',
			entityChangedEventMode: 'emit'
		}),
		CacheCleaner(["cache.clean.v1.repos"]),
		ConfigLoader(['surfdns.repo.**'])
	],

	/**
	 * Service dependencies
	 */
	dependencies: [
		{ name: "repos", version: 1 }
	],

	/**
	 * Service settings
	 */
	settings: {
		rest: "/v1/repos/:repo/commits",

		fields: {
			id: {
				type: "string",
				primaryKey: true,
				secure: true,
				columnName: "_id"
			},


			repo: {
				type: "string",
				empty: false,
				readonly: false,
				populate: {
					action: "v1.repos.resolve",
					params: {
						//fields: ["id", "domain"]
					}
				},
				onCreate: ({ ctx }) => ctx.params.repo,
				validate: "validateRepo",
			},

			owner: {
				type: "string",
				readonly: true,
				required: true,
				populate: {
					action: "v1.accounts.resolve",
					params: {
						fields: ["id", "username", "fullName", "avatar"]
					}
				},
				onCreate: ({ ctx }) => ctx.meta.userID,
				//validate: "validateOwner"
			},

			name: {
				type: "string",
				required: true,
				empty: false,
			},

			tarball: {
				type: "string",
				required: false
			},

			status: {
				type: "string",
				required: true,
				empty: false,
			},
			last: {
				type: "string",
				required: true,
				empty: false,
			},
			hash: {
				type: "string",
				required: true,
				empty: false,
			},
			action: {
				type: "string",
				required: true,
				empty: false,
			},
			branch: {
				type: "string",
				required: true,
				empty: false,
			},

			options: { type: "object" },
			...C.TIMESTAMP_FIELDS
		},

		scopes: {
			// Return addons.attachments of a given addon where the logged in user is a member.

			async repo(query, ctx, params) { return this.validateHasRepoPermissions(query, ctx, params) },

			// attachment the not deleted addons.attachments
			notDeleted: { deletedAt: null }
		},

		defaultScopes: ["repo", "notDeleted"]
	},

	/**
	 * Actions
	 */

	actions: {
		create: {
			permissions: ['domains.records.create'],
		},
		list: {
			permissions: ['domains.records.list'],
			permissionsTarget: 'domain',
			params: {
				repo: { type: "string" }
			}
		},

		find: {
			rest: "GET /find",
			permissions: ['domains.records.find'],
			params: {
				repo: { type: "string" }
			}
		},

		count: {
			rest: "GET /count",
			permissions: ['domains.records.count'],
			params: {
				repo: { type: "string" }
			}
		},

		get: {
			needEntity: true,
			permissions: ['domains.records.get']
		},

		update: {
			needEntity: true,
			permissions: ['domains.records.update']
		},

		replace: false,

		remove: {
			needEntity: true,
			permissions: ['domains.records.remove']
		},
	},

	/**
	 * Events
	 */
	events: {
		async "domains.created"(ctx) {
			const domain = ctx.params.data;





		},
		async "repos.removed"(ctx) {
			const repo = ctx.params.data;
			try {
				const attachments = await this.findEntities(ctx, {
					query: { repo: repo.id },
					fields: ["id"],
					scope: false
				});
				await this.Promise.all(
					attachments.map(attachment => this.removeEntity(ctx, { id: attachment.id, scope: false }))
				);
			} catch (err) {
				this.logger.error(`Unable to delete attachments of repo '${repo.id}'`, err);
			}
		},
	},

	/**
	 * Methods
	 */
	methods: {
		async validateHasRepoPermissions(query, ctx, params) {
			// Adapter init
			if (!ctx) return query;

			if (params.repo) {
				const res = await ctx.call("v1.repos.getRepo", {
					id: params.repo, member: ctx.meta.userID
				});

				if (res) {
					query.repo = params.repo;
					return query;
				}
				throw new MoleculerClientError(
					`You have no right for the repo '${params.repo}'`,
					403,
					"ERR_NO_PERMISSION",
					{ repo: params.repo }
				);
			}
			if (ctx.action.params.repo && !ctx.action.params.repo.optional) {
				throw new MoleculerClientError(`repo is required`, 422, "VALIDATION_ERROR", [
					{ type: "required", field: "repo" }
				]);
			}
		},

		async validateRepo({ ctx, value, params, id, entity }) {
			return ctx.call("v1.repos.getRepo", { id: params.repo, member: ctx.meta.userID })
				.then((res) => res ? true : `No permissions '${value} not found'`)
		},
	},

	/**
	 * Service created lifecycle event handler
	 */
	created() { },

	/**
	 * Service started lifecycle event handler
	 */
	started() { },

	/**
	 * Service stopped lifecycle event handler
	 */
	stopped() { }
};