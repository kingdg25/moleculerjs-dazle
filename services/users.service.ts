"use strict";
import {Context, Service, ServiceBroker, ServiceSchema} from "moleculer";

import DbConnection from "../mixins/db.mixin";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import HTTPClientService from "moleculer-http-client";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const MailService = require("moleculer-mail");

dotenv.config();
const client = new OAuth2Client(process.env.GOOGLE_ID, process.env.GOOGLE_SECRET);

export default class UsersService extends Service{

	private DbMixin = new DbConnection("users").start();

	// @ts-ignore
	public  constructor(public broker: ServiceBroker, schema: ServiceSchema<{}> = {}) {
		super(broker);
		this.parseServiceSchema(Service.mergeSchemas({
			name: "users",
			mixins: [this.DbMixin, MailService, HTTPClientService],
			settings: {
                JWT_SECRET: process.env.JWT_SECRET || "jwt-secret",

                /** MAIL **/
                from: "no-reply@dwellu.online.com",
                transport: {
                    host: "smtp.gmail.com",
                    service: "gmail",
                    port: 2525,
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
                    "mobile_number",
                    "position",
                    "license_number",
                    "email",
                    "token",
                    "is_new_user"
                ],
				logging: true,

                // Validator for the `create` & `insert` actions.
                entityValidator: {
                    firstname: { type: "string" },
                    lastname: { type: "string" },
                    mobile_number: { type: "string" },
                    position: { type: "enum", values: ["Broker", "Salesperson"] },
                    license_number: { type: "string", optional: true },
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
                    is_new_user: { type: "boolean", default: true },
                    invites: {
                        type: "array",
                        optional: true,
                        items: {
                            type: "object",
                            props: {
                                invited: { type: "boolean", default: false },
                                email: { type: "string", empty: false },
                            }
                        },
                    },
                    verified: { type: "boolean", default: false },
                    createdAt: { type: "date", default: () => new Date() },
                    updatedAt: { type: "date", default: () => new Date() },
                },
                
			},
			hooks: {
				before: {
					/**
					 * Register a before hook for the `create` action.
					 * It sets a default value for the quantity field.
					 *
					 * @param {Context} ctx
					 */
					// create: (ctx: Context<{ quantity: number }>) => {
					// 	ctx.params.quantity = 0;
					// },
				},
			},
			actions: {
				/**
				 * The "moleculer-db" mixin registers the following actions:
				 *  - list
				 *  - find
				 *  - count
				 *  - create
				 *  - insert
				 *  - update
				 *  - remove
				 */

				// --- ADDITIONAL ACTIONS ---

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
        
                        const found = await this.adapter.findOne({
                            email: entity.email,
                        });
                        if (found) {
                            return {
                                success: false,
                                status: "Email already exist",
                            };
                        }

                        // for salesperson only
                        if ( entity.position == "Salesperson" ) {
                            // check salesperson broker
                            const brokerFound = await this.adapter.findOne({
                                license_number: entity.license_number
                            });
                            if (!brokerFound){
                                return {
                                    success: false,
                                    status: "It seems your Broker is not yet with Dazle. Invite your Broker to complete your registration.",
                                };
                            }

                            // send request invite to broker
                            const doc = await this.adapter.updateById(
                                brokerFound._id,
                                {
                                    $push: {
                                        invites: {
                                            invited: false,
                                            email: entity.email // salesperson email
                                        }
                                    }
                                }
                            );
                            console.log('send invitation to broker', doc);
                        }
        
                        entity.password = bcrypt.hashSync(
                            entity.password,
                            10
                        );
                        entity.type = 'email&pass';
                        entity.token = crypto.randomBytes(50 / 2).toString("hex");

        
                        const doc = await this.adapter.insert(entity);
                        const json = await this.transformDocuments(ctx, ctx.params, doc);
                        await this.entityChanged("created", json, ctx);
        
                        return { success: true, user: json, status: "Success" };
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
                        const auth = ctx.params.user;
        
                        const found = await this.adapter.findOne({
                            email: auth.email,
                        });

                        // check user
                        if (found) {
                            // check password
                            if ( (await bcrypt.compare(auth.password, found.password)) ) {
                                // check if user is invited
                                const foundInvited = await this.adapter.findOne({
                                    invites: {
                                        $elemMatch: {
                                            email: auth.email,
                                            invited: true
                                        }
                                    }
                                });

                                if ( foundInvited ) {
                                    const json = await this.transformDocuments(ctx, ctx.params, found);
                                    await this.entityChanged("updated", json, ctx);

                                    return { success: true, user: json, status: "Login success" };
                                }

                                return { success: false, user: auth, status: "Your account status is currently pending" };
                            }
                        }

                        return { success: false, user: auth, status: "Please enter a valid username/password to sign in" };
                    }
                },
        
                /**
                 * Forgot password
                 *
                 * @param {Object} user - User entity
                 */
                forgotPassword: {
                    rest: {
                        method: "POST",
                        path: "/forgot-password"
                    },
                    params: {
                        user: { type: "object" },
                    },
                    /** @param {Context} ctx  */
                    async handler(ctx) {
                        const entity = ctx.params.user;
        
                        if (entity.email) {
                            const found = await this.adapter.findOne({
                                email: entity.email,
                            });

                            if (found) {

                                if (found.type == 'email&pass'){
                                    const genCode = Math.random().toString(36).substr(2, 4);
            
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
                                    
                                    json.code = genCode;
            
                                    return { success: true, user: json, status: "Success" };
                                
                                }
                            }
                        }

                        return { success: false, status: "Sorry we can't find an account with this email address" };
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
        
                                return { user: json, success: true, status: "Success" };
                            }
                        }
                        
                        return { success: false, status: "Sorry we can't find an account with this email address" };
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
                        const entity = ctx.params.user;
        
                        const found = await this.adapter.findOne({
                            email: entity.email,
                        });
        
                        if (found) {
                            // check if user is invited
                            const foundInvited = await this.adapter.findOne({
                                invites: {
                                    $elemMatch: {
                                        email: found.email,
                                        invited: true
                                    }
                                }
                            });

                            if ( foundInvited ) {
                                const json = await this.transformDocuments(ctx, ctx.params, found);
                                await this.entityChanged("updated", json, ctx);

                                return { success: true, user: json, status: "Social login Success" };
                            }

                            return { success: false, user: found, status: "Your account status is currently pending" };
                        }
                        else{
                            if (entity.type === "gmail") {
                                console.log('google credentials', process.env.GOOGLE_ID, process.env.GOOGLE_SECRET);
                                console.log(entity.token);
        
                                const ticket = await client.verifyIdToken({
                                    idToken: entity.token,
                                    // audience: process.env.GOOGLE_ID,
                                });
                                
                                console.log('ticket ticker', ticket);
        
                                if (ticket) {
                                    const { given_name, family_name, email } = ticket.getPayload();
        
                                    entity.token = ctx.params.user.token;
                                    entity.firstname = given_name;
                                    entity.lastname = family_name;
                                    entity.email = email;
        
                                    const doc = await this.adapter.insert(entity);
                                    const json = await this.transformDocuments(ctx, ctx.params, doc);
                                    await this.entityChanged("created", json, ctx);
        
                                    return { user: json, success: true, status: "Google login Success" };
                                
                                }
                                else {
                                    return { success: false, status: "Google login fail" };
                                }
                            }
                            else if (entity.type === "facebook") {
                                console.log('facebook token',entity.token);
        
                                const resp = await this._client.get(`https://graph.facebook.com/v2.12/me?fields=name,first_name,last_name,email&access_token=${entity.token}`);
                                const data = JSON.parse(resp.body);
        
                                console.log('faceboook json data', data);
        
                                if (data != null) {
                                    entity.token = ctx.params.user.token;
                                    entity.firstname = data['first_name'];
                                    entity.lastname = data['last_name'];
                                    entity.email = ctx.params.user.email;
        
                                    const doc = await this.adapter.insert(entity);
                                    const json = await this.transformDocuments(ctx, ctx.params, doc);
                                    await this.entityChanged("created", json, ctx);
        
                                    return { user: json, success: true, status: "facebook login Success" };
                                
                                }
                                else {
                                    return { success: false, status: "Facebook login failed" };
                                }
                            }
                            else {
                                return { success: false, status: "No login type found" };
                            }
                        }
                    }
                },

                /**
                 * new user
                 *
                 * @param {Object} user - User entity
                 */
                 isNewUser: {
                    rest: {
                        method: "POST",
                        path: "/is-new-user"
                    },
                    params: {
                        user: { type: "object" },
                    },
                    /** @param {Context} ctx  */
                    async handler(ctx) {
                        const auth = ctx.params.user;
        
                        const found = await this.adapter.findOne({
                            email: auth.email,
                        });

                        if (found) {
                            const doc = await this.adapter.updateById(
                                found._id,
                                {
                                    $set: {
                                        is_new_user: auth.is_new_user,
                                    },
                                }
                            );
    
                            const json = await this.transformDocuments(ctx, ctx.params, doc);
                            await this.entityChanged("updated", json, ctx);
    
                            return { success: true, user: json, status: "Success" };
                        }

                        return { success: false, user: auth, status: "Failed" };
                    }
                },

                /**
                 * check broker license number
                 *
                 * @param {String} license_number - Broker license number
                 */
                 checkLicenseNumber: {
                    rest: {
                        method: "POST",
                        path: "/check-license-number"
                    },
                    params: {
                        license_number: { type: "string" },
                    },
                    /** @param {Context} ctx  */
                    async handler(ctx) {
                        const license_number = ctx.params.license_number;
        
                        const found = await this.adapter.findOne({
                            position: 'Broker',
                            license_number: license_number,
                        });

                        if (found) {
                            return { success: true, broker: found, status: "Success" };
                        }

                        return { success: false, status: "It seems your Broker is not yet with Dazle. Invite your Broker to complete your registration." };
                    }
                },

                /**
                 * invite user to dazle
                 *
                 * @param {String} id - id
                 * @param {String} invited_by_email - email
                 */
                invite: {
                    rest: {
                        method: "POST",
                        path: "/invite"
                    },
                    params: {
                        id: { type: "string" },
                        invited_by_email: { type: "string" },
                    },
                    /** @param {Context} ctx  */
                    async handler(ctx) {
                        // check the one who's inviting the user by id
                        const found = await this.adapter.findOne({
                            _id: ctx.params.id
                        });

                        // check also the email of user who is invited
                        const foundInvitedUser = await this.adapter.findOne({
                            email: ctx.params.invited_by_email
                        });


                        if ( found && foundInvitedUser ){
                            // add invited user
                            const doc = await this.adapter.updateById(
                                found._id,
                                {
                                    $push: {
                                        invites: {
                                            invited: true,
                                            email: ctx.params.invited_by_email
                                        }
                                    }
                                }
                            );

                            const json = await this.transformDocuments(ctx, ctx.params, doc);
                            await this.entityChanged("updated", json, ctx);

                            return { success: true, broker: json, status: "Success" };
                        }

                        return { success: false, status: "Failed" };
                    }
                },

                /**
                 * Check if user is authenticated or invited
                 *
                 * @param {String} token - user token
                 */
                 isAuthenticated: {
                    rest: {
                        method: "POST",
                        path: "/is-authenticated"
                    },
                    params: {
                        token: { type: "string" },
                    },
                    /** @param {Context} ctx  */
                    async handler(ctx) {
                        const found = await this.adapter.findOne({
                            token: ctx.params.token
                        });

                        if (found) {
                            // check if user is invited
                            const foundInvited = await this.adapter.findOne({
                                invites: {
                                    $elemMatch: {
                                        email: found.email,
                                        invited: true
                                    }
                                }
                            });

                            if ( foundInvited ) {
                                return { success: true, status: "User authenticated success" };
                            }

                            return { success: false, status: "Your account status is currently pending" };
                        }

                        return { success: false, status: "Fail to authenticate" };
                    }
                },

                /**
                 * Setup Profile for social logins user.
                 *
                 * @param {Object} user - User entity
                 */
                 setupProfile: {
                    rest: {
                        method: "PUT",
                        path: "/setup-profile"
                    },
                    params: {
                        user: { type: "object" },
                    },
                    /** @param {Context} ctx  */
                    async handler(ctx) {
                        const entity = ctx.params.user;
        
                        const found = await this.adapter.findOne({
                            email: entity.email,
                        });
                        if (found) {
                            // for salesperson only
                            if ( entity.position == "Salesperson" ) {
                                // check salesperson broker
                                const brokerFound = await this.adapter.findOne({
                                    license_number: entity.license_number
                                });
                                if (!brokerFound){
                                    return {
                                        success: false,
                                        status: "It seems your Broker is not yet with Dazle. Invite your Broker to complete your registration.",
                                    };
                                }

                                // send request invite to broker
                                const doc = await this.adapter.updateById(
                                    brokerFound._id,
                                    {
                                        $push: {
                                            invites: {
                                                invited: false,
                                                email: entity.email // salesperson email
                                            }
                                        }
                                    }
                                );
                            }
            
                            const doc = await this.adapter.updateById(
                                found._id,
                                {
                                    $set: entity
                                }
                            );
                            const json = await this.transformDocuments(ctx, ctx.params, doc);
                            await this.entityChanged("updated", json, ctx);
            
                            return { success: true, user: json, status: "Update Success" };
                        }

                        return { success: false, status: "Update Fail" };
                    }
                }


			},
			methods: {
				/**
				 * Loading sample data to the collection.
				 * It is called in the DB.mixin after the database
				 * connection establishing & the collection is empty.
				 */
                 async seedDB() {
                    const email = process.env.ADMIN_EMAIL;
                    const pass = process.env.ADMIN_PASS;

                    const password = bcrypt.hashSync(
                        pass,
                        10
                    );
                    const type = 'email&pass';
                    const token = crypto.randomBytes(50 / 2).toString("hex");

                    await this.adapter.insertMany([
                        { firstname: "app", lastname: "admin", position: "Broker", email: email, password: password, type: type, token: token }
                    ]);
                }
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
