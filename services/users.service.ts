"use strict";
import crypto from "crypto";
import {Context, Service, ServiceBroker, ServiceSchema} from "moleculer";

import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { OAuth2Client } from "google-auth-library";
import HTTPClientService from "moleculer-http-client";
import DbConnection from "../mixins/db.mixin";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const MailService = require("moleculer-mail");

dotenv.config();
const client = new OAuth2Client(process.env.GOOGLE_ID, process.env.GOOGLE_SECRET);
const ObjectID = require("mongodb").ObjectID;

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
                    "broker_license_number",
                    "email",
                    "token",
                    "is_new_user",
                    "about_me"
                ],
				logging: true,

                // Validator for the `create` & `insert` actions.
                entityValidator: {
                    firstname: { type: "string" },
                    lastname: { type: "string" },
                    mobile_number: { type: "string" },
                    position: { type: "enum", values: ["Broker", "Salesperson"] },
                    broker_license_number: { type: "string" },
                    email: { type: "email" },
                    password: {
                        type: "string",
                        min: 8,
                    },
                    login_type: { type: "string", optional: true },
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
                                date_modified: { type: "date", default: () => new Date() },
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
                                error_type: "email_exist",
                                status: "Email already exist",
                            };
                        }

                        // for salesperson only
                        if ( entity.position == "Salesperson" ) {
                            // check salesperson broker
                            const brokerFound = await this.adapter.findOne({
                                broker_license_number: entity.broker_license_number,
                                position: "Broker"
                            });
                            if (brokerFound){
                                // send request invite to broker
                                await this.adapter.updateById(
                                    brokerFound._id,
                                    {
                                        $push: {
                                            invites: {
                                                invited: false,
                                                email: entity.email, // salesperson email
                                                date_modified: new Date()
                                            }
                                        }
                                    }
                                );
                            }
                        
                        }
                        else if ( entity.position == "Broker" ) {
                            // check broker license number
                            const brokerLicenseNumberFound = await this.adapter.findOne({
                                broker_license_number: entity.broker_license_number,
                                position: "Broker"
                            });
                            if (brokerLicenseNumberFound) {
                                return {
                                    success: false,
                                    error_type: "broker_exist",
                                    status: "Broker already exist",
                                };
                            }


                            // check admin
                            const adminFound = await this.adapter.findOne({
                                broker_license_number: "1234567890",
                                position: "Broker"
                            });

                            if ( adminFound ) {
                                // send request invite to admin
                                await this.adapter.updateById(
                                    adminFound._id,
                                    {
                                        $push: {
                                            invites: {
                                                invited: false,
                                                email: entity.email, // broker email
                                                date_modified: new Date()
                                            }
                                        }
                                    }
                                );
                            }

                            // check all data that have position of salesperson and the same broker license number
                            // add salesperson that already registered before the broker
                            const allData = await this.adapter.find();
                            let finalSalesperson = <any>[];

                            let salesperson = allData.filter(function(data: any) {
                                return data.broker_license_number === entity.broker_license_number && data.position === "Salesperson";
                            });

                            if (salesperson) {
                                salesperson.forEach( (data: any) => {
                                    finalSalesperson.push({
                                        invited: false,
                                        email: data.email,
                                        date_modified: new Date()
                                    });
                                });
                                // console.log(salesperson, finalSalesperson);

                                entity.invites = finalSalesperson; // add salesperson to the broker
                            }

                        }

                        entity.password = bcrypt.hashSync(
                            entity.password,
                            10
                        );
                        entity.login_type = 'email&pass';
                        entity.token = crypto.randomBytes(50 / 2).toString("hex");

                        const doc = await this.adapter.insert(entity);
                        const json = await this.transformDocuments(ctx, ctx.params, doc);
                        await this.entityChanged("created", json, ctx);

        
                        return { success: true, user: json, status: "Registration Success" };
                        
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

                                return { success: false, error_type: "pending", user: auth, status: "Your account status is currently pending" };
                            }
                        }

                        return { success: false, error_type: "not_found", user: auth, status: "Please enter a valid username/password to sign in" };
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

                                if (found.login_type == 'email&pass'){
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

                        return { success: false, error_type: "not_found", status: "Sorry we can't find an account with this email address" };
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
                        
                        return { success: false, error_type: "not_found", status: "Sorry we can't find an account with this email address" };
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
                            // check user required fields on social logins
                            if( found.mobile_number && found.position && found.broker_license_number ) {
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
                        
                                return { success: false, error_type: "pending", user: found, status: "Your account status is currently pending" };
                            }
                        
                            return { success: false, error_type: "no_setup_profile", user: found, status: `${found.login_type} login fail` };
                        }
                        else{
                            if (entity.login_type === "gmail") {
                                console.log('google credentials', process.env.GOOGLE_ID, process.env.GOOGLE_SECRET);
                                console.log(entity.token);
        
                                const ticket = await client.verifyIdToken({
                                    idToken: entity.token,
                                    // audience: process.env.GOOGLE_ID,
                                });
                                
                                console.log('ticket ticker', ticket);
        
                                if (ticket) {
                                    const { given_name, family_name, email } = ticket.getPayload();
        
                                    entity.firstname = given_name;
                                    entity.lastname = family_name;
                                    entity.is_new_user = true;
        
                                    const doc = await this.adapter.insert(entity);
                                    const json = await this.transformDocuments(ctx, ctx.params, doc);
                                    await this.entityChanged("created", json, ctx);
        
                                    return { user: json, success: true, status: "Google login Success" };
                                
                                }
                                else {
                                    return { success: false, error_type: "google_login_fail", status: "Google login fail" };
                                }
                            }
                            else if (entity.login_type === "facebook") {
                                console.log('facebook token',entity.token);

                                const resp = await this._client.get(`https://graph.facebook.com/v2.12/me?fields=name,first_name,last_name,email&access_token=${entity.token}`);
                                const data = JSON.parse(resp.body);
        
                                console.log('faceboook json data', data);
        
                                if (data != null) {
                                    entity.firstname = data['first_name'];
                                    entity.lastname = data['last_name'];
                                    entity.is_new_user = true;
        
                                    const doc = await this.adapter.insert(entity);
                                    const json = await this.transformDocuments(ctx, ctx.params, doc);
                                    await this.entityChanged("created", json, ctx);
        
                                    return { user: json, success: true, status: "facebook login Success" };
                                
                                }
                                else {
                                    return { success: false, error_type: "facebook_login_fail", status: "Facebook login failed" };
                                }
                            }
                            else {
                                return { success: false, error_type: "no_login_type_found", status: "No login type found" };
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

                        return { success: false, error_type: "not_found", user: auth, status: "Failed" };
                    }
                },

                /**
                 * check broker license number
                 *
                 * @param {String} broker_license_number - Broker license number
                 */
                 checkLicenseNumber: {
                    rest: {
                        method: "POST",
                        path: "/check-license-number"
                    },
                    params: {
                        broker_license_number: { type: "string" },
                    },
                    /** @param {Context} ctx  */
                    async handler(ctx) {
                        const broker_license_number = ctx.params.broker_license_number;
        
                        const found = await this.adapter.findOne({
                            position: 'Broker',
                            broker_license_number: broker_license_number,
                        });

                        if (found) {
                            const json = await this.transformDocuments(ctx, ctx.params, found);
                            return { success: true, broker: json, status: "Success" };
                        }

                        return { success: false, error_type: "no_broker", status: "It seems your Broker is not yet with Dazle. Invite your Broker to complete your registration." };
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

                            return { success: false, error_type: "pending", status: "Your account status is currently pending" };
                        }

                        return { success: false, error_type: "not_found", status: "Fail to authenticate" };
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
                                    broker_license_number: entity.broker_license_number,
                                    position: "Broker"
                                });
                                if (brokerFound){
                                    // send request invite to broker
                                    await this.adapter.updateById(
                                        brokerFound._id,
                                        {
                                            $push: {
                                                invites: {
                                                    invited: false,
                                                    email: entity.email, // salesperson email
                                                    date_modified: new Date()
                                                }
                                            }
                                        }
                                    );
                                }
                            }
                            else if ( entity.position == "Broker" ) {
                                // check broker license number
                                const brokerLicenseNumberFound = await this.adapter.findOne({
                                    broker_license_number: entity.broker_license_number,
                                    position: "Broker"
                                });
                                if (brokerLicenseNumberFound) {
                                    return {
                                        success: false,
                                        error_type: "broker_exist",
                                        status: "Broker already exist",
                                    };
                                }


                                // check admin
                                const adminFound = await this.adapter.findOne({
                                    broker_license_number: "1234567890",
                                    position: "Broker"
                                });

                                if ( adminFound ) {
                                    // send request invite to admin
                                    await this.adapter.updateById(
                                        adminFound._id,
                                        {
                                            $push: {
                                                invites: {
                                                    invited: false,
                                                    email: entity.email, // broker email
                                                    date_modified: new Date()
                                                }
                                            }
                                        }
                                    );
                                }

                                // check all data that have position of salesperson and the same broker license number
                                // add salesperson that already registered before the broker
                                const allData = await this.adapter.find();
                                let finalSalesperson = <any>[];

                                let salesperson = allData.filter(function(data: any) {
                                    return data.broker_license_number === entity.broker_license_number && data.position === "Salesperson";
                                });

                                if (salesperson) {
                                    salesperson.forEach( (data: any) => {
                                        finalSalesperson.push({
                                            invited: false,
                                            email: data.email
                                        });
                                    });
                                    // console.log(salesperson, finalSalesperson);

                                    entity.invites = finalSalesperson; // add salesperson to the broker
                                }
                            }
            
                            const doc = await this.adapter.updateById(
                                found._id,
                                {
                                    $set: entity
                                }
                            );
                            const json = await this.transformDocuments(ctx, ctx.params, doc);
                            await this.entityChanged("updated", json, ctx);
            
                            return { success: true, user: json, status: "Setup Profile Success" };
                        }

                        return { success: false, error_type: "not_found", status: "Setup Profile Fail" };
                    }
                },

                /**
                 * Update user.
                 *
                 * @param {Object} user - User entity
                 */
                 update: {
                    rest: {
                        method: "PUT",
                        path: "/update"
                    },
                    params: {
                        user: { type: "object" },
                    },
                    /** @param {Context} ctx  */
                    async handler(ctx) {
                        const entity = ctx.params.user;
        
                        const found = await this.adapter.findOne({
                            _id: new ObjectID(entity._id)
                        });
                        if (found) {
                            const doc = await this.adapter.updateById(
                                found._id,
                                {
                                    $set: {
                                        firstname: entity.firstname,
                                        lastname: entity.lastname,
                                        mobile_number: entity.mobile_number,
                                        about_me: entity.about_me
                                    }
                                }
                            );
                            const json = await this.transformDocuments(ctx, ctx.params, doc);
                            await this.entityChanged("updated", json, ctx);
            
                            return { success: true, user: json, status: "Update Success" };
                        }

                        return { success: false, error_type: "not_found", status: "Update Fail" };
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
                    const login_type = 'email&pass';
                    const token = crypto.randomBytes(50 / 2).toString("hex");

                    await this.adapter.insertMany([
                        { firstname: "app", lastname: "admin", position: "Broker", "broker_license_number": "1234567890", email: email, password: password, login_type: login_type, token: token, "is_new_user": false, "invites":[{"invited":true,"email":email, "date_modified": new Date()}] }
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
