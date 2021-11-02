"use strict";


const DbMixin = require("../mixins/db.mixin");
const bcrypt = require('bcrypt');
const MailService = require("moleculer-mail");
const dotenv = require('dotenv');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const HTTPClientService = require("moleculer-http-client");


dotenv.config();
const client = new OAuth2Client(process.env.GOOGLE_ID, process.env.GOOGLE_SECRET);

/**
 * @typedef {import('moleculer').Context} Context Moleculer's Context
 */

 module.exports = {
	name: "users",

	/**
	 * Mixins
	 */
    mixins: [DbMixin("users"), MailService, HTTPClientService],
    
    /**
	 * Settings
	 */
	settings: {
		/** MAIL **/
		from: "no-reply@xercis.demo.com",
		transport: {
			service: "gmail",
			auth: {
				user: process.env.EMAIL_USER,
				pass: process.env.EMAIL_PASS,
			},
		},
        // Available fields in the responses
        fields: [
            "_id",
            "firstname",
            "lastname",
            "email",
			"token"
        ],
        logging: true,
        // Validator for the `create` & `insert` actions.
        entityValidator: {
            firstname: { type: "string" },
            lastname: { type: "string" },
            email: { type: "email" },
            password: {
                type: "string",
                min: 6,
            },
			code: { type: "string", optional: true },
			token: {
				type: "string",
				virtual: true,
				optional: true,
			},
            // createdAt: { type: "number", readonly: true, onCreate: () => Date.now() },
	        // updatedAt: { type: "number", readonly: true, onUpdate: () => Date.now() },
        },
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
		 * Register a new user.
		 *
		 * @param {Object} user - User entity
		 */
         register: {
			rest: {
                method: "POST",
				path: "/register"
            },
			params: {
                user: { type: "object" },
			},
			/** @param {Context} ctx  */
			async handler(ctx) {
                const entity = ctx.params.user;
                await this.validateEntity(entity);

                if (entity.email) {
                    const found = await this.adapter.findOne({
                        email: entity.email,
                    });
                    if (found) {
                        return Promise.reject({
                            status: "Email Exist",
                        });
                    }
                }

                entity.password = bcrypt.hashSync(
                    entity.password,
                    10
                );
				entity.type = 'email&pass';
				entity.token = crypto.randomBytes(50 / 2).toString("hex");
                entity.createdAt = new Date();

                const doc = await this.adapter.insert(entity);
				const json = await this.transformDocuments(ctx, ctx.params, doc);
				await this.entityChanged("created", json, ctx);

				return json;
			}
		},

		/**
		 * Login a user
		 *
		 * @param {Object} user - User entity
		 */
		login: {
			rest: {
				method: "POST",
				path: "/login"
			},
			params: {
				user: { type: "object" },
			},
			/** @param {Context} ctx  */
			async handler(ctx) {
				let success = false;
				const auth = ctx.params.user;

				const found = await this.adapter.findOne({
					email: auth.email,
				});

				if (found) {
					if (
						!(await bcrypt.compare(
							auth.password,
							found.password
						))
					) {
						return { success: success, user: auth, status: "Failed" };
					}
				} else {
					return { success: success, user: auth, status: "Failed" };
				}
				success = true;

				return { success: success, user: found, status: "Success" };
			}
		},

		/**
		 * Forget password
		 *
		 * @param {Object} user - User entity
		 */
		forgetPassword: {
			rest: {
				method: "POST",
				path: "/forget-password"
			},
			params: {
				user: { type: "object" },
			},
			/** @param {Context} ctx  */
			async handler(ctx) {
				let success = false;
				const entity = ctx.params.user;

				if (entity.email) {
					const found = await this.adapter.findOne({
						email: entity.email,
					});
					if (found.type == 'email&pass') {
						const genCode = Math.random().toString(36).substr(2, 4);

						console.log(genCode);

						this.send({
							to: entity.email,
							subject: "Verification Code",
							html: "This is your verification code <b>" +
								genCode +
								"</b>.",
						});

						const doc = await this.adapter.updateById(
							found._id, 
							{ $set: { code: genCode } }
						);
						const json = await this.transformDocuments(ctx, ctx.params, doc);
						await this.entityChanged("updated", json, ctx);
						success = true;

						return { success: success, user: json, status: "Success" };

					} else {
						return { success: success, status: "not found" };
					}
				} else {
					return { success: success, status: "not found" };
				}
			}
		},

		/**
		 * Reset password
		 *
		 * @param {Object} user - User entity
		 */
		resetPassword: {
			rest: {
				method: "POST",
				path: "/reset-password"
			},
			params: {
				user: { type: "object" },
			},
			/** @param {Context} ctx  */
			async handler(ctx) {
				let success = false;
				const entity = ctx.params.user;

				if (entity.email) {
					const found = await this.adapter.findOne({
						email: entity.email,
						code: entity.code,
					});
					if (found) {
						const doc = await this.adapter.updateById(
							found._id,
							{
								$set: {
									password: bcrypt.hashSync(
										entity.password,
										10
									),
								},
							}
						);

						const json = await this.transformDocuments(ctx, ctx.params, doc);
						await this.entityChanged("updated", json, ctx);
						success = true;

						return { user: json, success: success, status: "Success" };
					}
					return { success: success, status: "failed" };
				}
			}
		},

		/**
		 * Social login
		 *
		 * @param {Object} user - User entity
		 */
		socialLogin: {
			rest: {
				method: "POST",
				path: "/social-login"
			},
			params: {
				user: { type: "object" },
			},
			/** @param {Context} ctx  */
			async handler(ctx) {
				let success = false;
				const entity = ctx.params.user;

				const found = await this.adapter.findOne({
					email: entity.email,
				});

				if (found) {
					success = true;
					return { success: success, user: found, status: "already na register success" };
				}
				else{
					if (entity.type === "gmail") {
						console.log('google credentials', process.env.GOOGLE_ID, process.env.GOOGLE_SECRET, process.env.REDIRECT_URI);
						console.log(entity.token);

						const ticket = await client.verifyIdToken({
							idToken: entity.token,
							// audience: process.env.GOOGLE_ID,
						});
						
						console.log('ticket ticker', ticket);

						if (ticket) {
							const { given_name, family_name, email } = ticket.getPayload();

							entity.createdAt = new Date();
							entity.token = ctx.params.user.token;
							entity.firstname = given_name;
							entity.lastname = family_name;
							entity.email = email;

							const doc = await this.adapter.insert(entity);
							const json = await this.transformDocuments(ctx, ctx.params, doc);
							await this.entityChanged("created", json, ctx);
							success = true;

							return { user: json, success: success, status: "google Success" };
						
						}
						else {
							return { success: success, status: "google fail" };
						}
					}
					else if (entity.type === "facebook") {
						console.log('facebook token',entity.token);

						const resp = await this._client.get(`https://graph.facebook.com/v2.12/me?fields=name,first_name,last_name,email&access_token=${entity.token}`);
						const data = JSON.parse(resp.body);

						console.log('faceboook json data', data);

						if (data != null) {
							entity.createdAt = new Date();
							entity.token = ctx.params.user.token;
							entity.firstname = data['first_name'];
							entity.lastname = data['last_name'];
							entity.email = ctx.params.user.email;

							const doc = await this.adapter.insert(entity);
							const json = await this.transformDocuments(ctx, ctx.params, doc);
							await this.entityChanged("created", json, ctx);
							success = true;

							return { user: json, success: success, status: "facebook Success" };
						
						}
						else {
							return { success: success, status: "facebook failed" };
						}
					}
					else {
						return { success: success, status: "no login type found" };
					}
				}
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
        /**
		 * Loading sample data to the collection.
		 * It is called in the DB.mixin after the database
		 * connection establishing & the collection is empty.
		 */
		async seedDB() {
			await this.adapter.insertMany([
				{ firstname: "Samsung Galaxy", lastname: "S10 Plus", email: "xercis.demo@gmail.com", password: "123456" }
			]);
		}
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
