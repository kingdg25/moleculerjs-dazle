"use strict";
import {Context, Service, ServiceBroker, ServiceSchema} from "moleculer";

import { formatDistanceToNow } from "date-fns";
import crypto from 'crypto';
import DbConnection from "../mixins/db.mixin";
import { promises as fs } from 'fs';

const ObjectID = require("mongodb").ObjectID;


export default class EmailVerificationService extends Service{

	private DbMixin = new DbConnection("email_verification").start();

	// @ts-ignore
	public  constructor(public broker: ServiceBroker, schema: ServiceSchema<{}> = {}) {
		super(broker);
		this.parseServiceSchema(Service.mergeSchemas({
			name: "email_verification",
			mixins: [this.DbMixin],
			settings: {
				// Available fields in the responses
				logging: true,
				fields: [
					"email",
					"token",
					"user_id"
                ],
				entityValidator: {
                    email: { type: "string" },
					user_id: { type: "string" },
					token: { type: "string", default: crypto.randomBytes(50 / 2).toString("hex") },
                    createdAt: { type: "date", default: () => new Date() },
                    updatedAt: { type: "date", default: () => new Date() },
                }
			},
			hooks: {
				before: {
					
				},
			},
			actions: {
				createOrFetchEmailVerification: {
					params: {
						email: "email",
						user_id: "string"
					},
                    async handler(ctx) {
						const email = ctx.params.email;
						const user_id = ctx.params.user_id;
						const emailFound = await this.adapter.findOne({
							email: email,
							user_id: user_id
						});
						
						if (emailFound) {
							const json = await this.transformDocuments(ctx, ctx.params, emailFound);
							return {
								success: true,
								email_verification: json,
								status: "An email verification found."
							}
						}
						
						await this.validateEntity(ctx.params);
						const doc = await this.adapter.insert(ctx.params);
                        const json = await this.transformDocuments(ctx, ctx.params, doc);
						await this.entityChanged("created", json, ctx);
                        return { success: true, email_verification: json, status: "Email Verification Created." };
					}
				},
				sendEmailVerification: {
					params: {
						email_verification: "object"
					},
                    async handler(ctx) {
						const email_verification = ctx.params.email_verification;
						const email = email_verification.email;
						const token = email_verification.token;
						let html:any = await fs.readFile(`${process.cwd()}/templates/email/email_content.html`, 'utf8');
						let final_html = html.replace("{Domain}", process.env.DOMAIN_NAME).replace("{email-add}", email).replace("{token}", token);
												
						return await broker.call("notify.notifyToEmail", {
							email: email,
							subject: "Dazle Email Verification",
							content: final_html
							// content: `Hello there! Just click the link below to verify your email <hr><hr> <a href="${process.env.DOMAIN_NAME}/email-verify/${email}/${token}">Click Here</a> `
						});
					}
				},
				createAndSendEmailVerification: {
					rest: {
                        method: "POST",
                        path: "/send-email-verification"
                    },
					params: {
						email: "email",
						user_id: "string"
					},
                    async handler(ctx) {
						const email_verification_responses: any = await broker.call("email_verification.createOrFetchEmailVerification", ctx.params);
						return await broker.call("email_verification.sendEmailVerification", { email_verification: email_verification_responses.email_verification});
					}
				},
				verifyEmail: {
					async handler(ctx) {
						ctx.meta.$responseType = "text/html; charset=UTF-8";

						const email = ctx.params.email;
						const token = ctx.params.key;
						console.log(email, token)
						const verificationFound = await this.adapter.findOne({
							email: email,
							token: token
						});
						
						if (verificationFound) {
							const updatedUser = await broker.call("users.updateEmailVerification", {
								user_id: verificationFound.user_id,
								verified: true
							});
							if (updatedUser) {
								broker.call("email_verification.remove", { id: verificationFound._id})
							}
							// READ FILE .html
							let html:string = await fs.readFile(`${process.cwd()}/templates/email/email_verified.html`, 'utf8');
							return html
						}

						ctx.meta.$responseType = "text/html; charset=UTF-8";
						let html:any = await fs.readFile(`${process.cwd()}/templates/email/email_not_verified.html`, 'utf8');
						return html;
					}
				},
				readTemplate: {
					async handler(ctx) {
						ctx.meta.$responseType = "text/html; charset=UTF-8";
						let html:any = await fs.readFile(`${process.cwd()}/templates/email/email_verification.html`, 'utf8');
						return html;
					}
				}
            },
			methods: {
			},
			/**
			 * Loading sample data to the collection.
			async afterConnected() {
			 await this.adapter.collection.createIndex({ name: 1 });
			},
			 */
		}, schema));
	}
}
