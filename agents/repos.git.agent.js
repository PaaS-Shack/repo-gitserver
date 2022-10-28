"use strict";

const http = require('http');
const path = require('path');
const spawn = require('child_process').spawn;

const auth = require('basic-auth')

const zlib = require('zlib');

const ConfigLoader = require("config-mixin");

const { MoleculerClientError } = require("moleculer").Errors;
const Context = require("moleculer").Context

const backend = require('git-http-backend');

/**
 * attachments of addons service
 */
module.exports = {
	name: "repos.git.agent",
	version: 1,

	mixins: [
		ConfigLoader(['repos.**'])
	],

	/**
	 * Service dependencies
	 */
	dependencies: [
		'v1.config'
	],

	/**
	 * Service settings
	 */
	settings: {


		sidebands: {}
	},


	crons: [
		{
			name: "ClearExpiredRecords",
			cronTime: "* * * * *",
			onTick: {
				//action: "v1.dohs.clearExpired"
			}
		}
	],
	/**
	 * Actions
	 */


	actions: {

		gitRequestToken: {
			cache: false,
			params: {
				name: { type: "string", min: 3, optional: false },
			},
			permissions: ['teams.create'],
			auth: "required",
			async handler(ctx) {
				const params = Object.assign({}, ctx.params);
				const { token } = await ctx.call('v1.tokens.generate', {
					type: 'api-key',
					owner: params.name
				})


				return {
					token,
					path: this.pullURL(token, params.name),
					nodeID: this.broker.nodeID
				};
			}
		},
		pullURL: {
			cache: false,
			params: {
				name: { type: "string", min: 3, optional: false },
				token: { type: "string", min: 3, optional: false },
			},
			permissions: ['teams.create'],
			auth: "required",
			async handler(ctx) {
				const { token, name } = Object.assign({}, ctx.params);
				return {
					token,
					path: this.pullURL(token, name),
					nodeID: this.broker.nodeID
				};
			}
		},

		sidebandWrite: {
			async handler(ctx) {

				let hash = ctx.meta.hash;
				//console.log(this.settings.sidebands, hash)
				if (!this.settings.sidebands[hash]) {
					throw new MoleculerClientError("sideband not found.", 400, "ERR_EMAIL_EXISTS");
				}
				this.settings.sidebands[hash].clear()

				let onData = (data) => {
					if (this.settings.sidebands[hash])
						this.settings.sidebands[hash].sideband.write(data)
				}

				let onEnd = (data) => {
					//console.log('repo sideband closed')
					ctx.params.removeListener('data', onData);
					if (ctx.meta.close) {
						this.settings.sidebands[hash].sideband.end();
						delete this.settings.sidebands[hash];
					}
				}

				ctx.params.on('data', onData);
				ctx.params.once('finish', onEnd);
			}
		},
	},

	/**
	 * Events
	 */
	events: {

		"repos.created": {
			async handler(ctx) {
				const repo = Object.assign({}, ctx.params.data);
				const cwd = `/repos/${repo.owner}/${repo.name}`
				const options = {
					nodeID: this.broker.nodeID,
					timeout: 10 * 60 * 1000
				}

				const isRepo = await ctx.call('v1.node.fs.stat', {
					path: cwd
				}, options).then(() => true).catch(() => false)

				if (!isRepo) {
					await ctx.call('v1.node.fs.mkdir', {
						path: cwd,
						recursive: true
					}, options);
					await ctx.call('v1.node.git.init', {
						cwd,
						bare: true
					}, options);
				}


				this.logger.info(`Created GIT bare repo ${cwd}`)
			}
		},

		"repos.removed": {
			async handler(ctx) {
				const repo = Object.assign({}, ctx.params.data);

				const cwd = `/repos/${repo.owner}/${repo.name}`

				const options = {
					nodeID: this.broker.nodeID,
					timeout: 10 * 60 * 1000
				}

				const isRepo = await ctx.call('v1.node.fs.stat', {
					path: cwd
				}, options).then(() => true).catch(() => false)

				if (isRepo) {
					await ctx.call('v1.node.fs.unlink', {
						path: cwd,
						recursive: true
					}, options);
				}

				this.logger.info(`Removed GIT bare repo ${cwd}`)
			}
		},
	},

	/**
	 * Methods
	 */

	methods: {

		gitBareDir(name) {
			return path.join('/repos', `${name}.git`);
		},
		gitChechoutDir(name) {
			return path.join('/repos-checkout', name);
		},

		logToStream(id, line) {
			//	this.streamClient.createWriteStream(id).write(line)
		},


		pullURL(token, name) {
			return `http://${token}:@${process.env.ADDRESS || '0.0.0.0'}:7784/${name}.git`
		},
		async onResponce(user, repo, data, action, sideband) {

			let commit = await this.broker.call('v1.repos.commits.create', {
				status: "accepted",
				name: repo.name,
				last: data.last,
				hash: data.head,
				action,
				branch: data.branch,
				repo: repo.id,
				owner: user.id,
			}, { meta: { userID: user.id } });

			this.logger.info(`commit pushed ${commit.hash}(${commit.status})`)


			const obj = this.settings.sidebands[commit.hash] = {
				sideband,
				clear: () => {
					//console.log('clearing reset sideband')
					clearTimeout(obj.timeout)
					clearInterval(obj.timer)
				},
				timer: setInterval(() => {
					sideband.write('Still nothing\n');
				}, 1000),
				timeout: setTimeout(() => {
					sideband.end('Sorry nothing bye\n');
					delete this.settings.sidebands[commit.hash]
				}, 35 * 1000)
			};

			sideband.end('Please stand by...\n');

		},



		async updateRepoSize(stats) {
			return;
			await this.updateEntity(this, stats.repo, {
				$set: {
					repoSize: stats['size-pack'],
					updatedAt: Date.now()
				}
			})
		},
		sendWWWAuth(res) {
			try {
				res.statusCode = 401;
				res.setHeader('WWW-Authenticate', 'Basic realm="example"');
			} catch (err) {
				console.log(err)
			}
			res.end('Access denied');
		},
		async authHTTPRequest(req, res, ctx) {
			const credentials = auth(req);
			if (!credentials) {
				this.sendWWWAuth(res)
				return false
			}

			let user;
			try {
				if (credentials.pass == '') {

					const res = await ctx.call('v1.tokens.check', {
						type: 'api-key',
						token: credentials.name
					})

					if (res) {
						this.logger.info(`Repo system token request`);
						return true
					}
				} else {
					const { token } = await ctx.call('v1.accounts.login', {
						email: credentials.name,
						password: credentials.pass
					});

					if (token) {
						this.logger.info(`Repo user login request`);
						user = await ctx.call('v1.accounts.resolveToken', {
							token
						});
					}

				}

			} catch (err) {
				this.logger.info(err)
				this.sendWWWAuth(res);
				return false
			}
			return user;
		},
		async onHTTPRequest(req, res, ctx) {

			let user = await this.authHTTPRequest(req, res, ctx)

			if (user === false) {
				console.log('no user')
				this.logger.info(`Repo user not found`);
				return;
			}

			let name = req.url.split('/').filter(f => f !== '').shift()

			if (!name) {
				return this.sendWWWAuth(res);
			}

			name = name.replace('.git', '');

			let repo = await ctx.call('v1.repos.getRepo', { name: name })

			if (!repo) {
				this.logger.error(`Repo not found ${name}`)
				return this.sendWWWAuth(res);
			}

			const cwd = `/repos/${repo.owner}/${name}`

			req.cwd = cwd;
			const options = {
				nodeID: this.broker.nodeID,
				timeout: 10 * 60 * 1000
			}

			const isRepo = await ctx.call('v1.node.fs.stat', {
				path: cwd
			}, options).then(() => true).catch(() => false)

			this.logger.info(`Repo(${repo.id}) request made. Is repo: ${isRepo}`)
			if (!isRepo) {
				await ctx.call('v1.node.fs.mkdir', {
					path: cwd,
					recursive: true
				}, options);
				await ctx.call('v1.node.git.init', {
					cwd,
					bare: true
				}, options);
			}

			req.user = user;
			req.repo = repo;
			req.ctx = ctx;
			if (user === true) {
				return this.handle(req, res);
			}


			this.handle(req, res);
		},
		async handle(req, res) {

			const reqStream = req.headers['content-encoding'] === 'gzip' ? req.pipe(zlib.createGunzip()) : req;

			reqStream.pipe(backend(req.url, (err, service) => {
				if (err) return res.end(err + '\n');
				res.setHeader('content-type', service.type);

				this.logger.info(`Repo(${req.repo.id}) git service start`, req.method, req.url, service.action, service.cmd, service.args, service.fields)

				const stream = service.createStream()

				const ps = spawn(service.cmd, service.args.concat(req.cwd));

				ps.stdout.pipe(stream).pipe(ps.stdin);
				
				if (service.action === 'push' && service.fields.last) {
					var sb = service.createBand();
					ps.once('close', async () => {

						this.logger.info(`Repo(${req.repo.id}) git service closed sideband opened`)
						await this.sync(req.repo)

						this.onResponce(req.user, req.repo, service.fields, service.action, sb)
					})
				}


			})).pipe(res);
		},
		async sync(repo) {


			this.logger.info(`Syncing repo ${repo.name}`)
			return;
			const nodeList = await this.broker.call("$node.list");
			const promises = [];

			for (let index = 0; index < nodeList.length; index++) {
				const node = nodeList[index];
				if (node.id == this.broker.nodeID)
					continue;
				promises.push(this.broker.call('v1.node.gitPullBare', {
					path: this.pullURL('6c36df3d3a040413637e64f028f2b1156d5db3a8cda444e687', repo.name),
					name: repo.name
				}, {
					nodeID: node.id
				}))
			}


			return Promise.allSettled(promises)
				.then((res) => res.filter((a) => a.status == 'fulfilled'))
				.then((res) => this.logger.info(`Synced ${res.length} nodes for repo ${repo.name}`))

		},
		async setupHTTPServer() {
			this.server = http.createServer(async (req, res) => {
				req.pause();
				let ctx = new Context(this.broker);
				this.onHTTPRequest(req, res, ctx);
			});

			this.server.timeout = 120000;
			this.server.keepAliveTimeout = this.server.timeout;

			this.server.setTimeout(this.server.timeout, () => {
				this.logger.info(new Error('Socket time out'));
			});

			const port = process.env.PORT || 7784
			const address = process.env.ADDRESS || '0.0.0.0'
			this.server.listen(port, address);
			this.logger.info(`Git server http://${address}:${port}`)


		}
	},

	/**
	 * Service created lifecycle event handler
	 */
	created() {

		this.streams = new Map();
	},

	/**
	 * Service started lifecycle event handler
	 */
	async started() {

		await this.setupHTTPServer();
	},

	/**
	 * Service stopped lifecycle event handler
	 */
	async stopped() {


		//this.streamClient.close()
		this.server.close();


	}
};