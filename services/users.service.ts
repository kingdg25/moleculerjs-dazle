"use strict";
import crypto from "crypto";
import {Context, Service, ServiceBroker, ServiceSchema} from "moleculer";

import bcrypt from "bcrypt";
import dotenv from "dotenv";
const jwt = require('jsonwebtoken');
import { OAuth2Client } from "google-auth-library";
import HTTPClientService from "moleculer-http-client";
import DbConnection from "../mixins/db.mixin";
import { promises as fs } from 'fs';

const { MoleculerError } = require("moleculer").Errors;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const MailService = require("moleculer-mail");
const verifyAppleIdToken = require("verify-apple-id-token").default;

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
                    "email_verified",
                    "about_me",
                    "profile_picture"
                ],
				logging: true,

                // Validator for the `create` & `insert` actions.
                entityValidator: {
                    firstname: { type: "string" },
                    lastname: { type: "string" },
                    mobile_number: { type: "string" },
                    position: { type: "enum", values: ["Broker", "Salesperson"] },
                    broker_license_number: { type: "string", optional: true },
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
                    email_verified: { type: "boolean", default: true },
                    verified: { type: "boolean", default: false },
                    profile_picture: { type: "string", optional: true},
                    about_me: { type: "string", optional: true},
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

                // JWT token generator

                getUsersFromListOfIds: { // get users from ids
                    params: {
                        user_ids: "array"
                    },
                    async handler(ctx) {
                        let user_ids: Array<any> = ctx.params.user_ids || [];
                        let users_profiles: Array<object> = [];
                        console.log(user_ids)
                        users_profiles = await this.adapter.find({
                            query: {
                                _id: {
                                    $in: user_ids.map(u => new ObjectID(u))
                                }
                            },
                            // sort: {_id: -1}
                        });
                        users_profiles = await this.transformDocuments(ctx, ctx.params, users_profiles)
                        console.log(users_profiles)


                        return users_profiles;
                    }
                },
                generateJWToken: {
                    params: {
                        user_object: "object"
                    },
                    async handler(ctx) {
                        const user_object = ctx.params.user_object;

                        if (!user_object) return new MoleculerError("No user_object found", 400, "NO_USER_OBJ_FOUND", { success: false, error_type: "not_user_obj_found", status: "No user_object found" });

                        return jwt.sign(user_object, process.env.JWT_SECRET, { expiresIn: process.env.JWT_SECRET_EXPIRES_IN });
                    }

                },
                verifyJWToken: {
                    params: {
                        token: "string"
                    },
                    async handler(ctx) {
                        const token = ctx.params.token;

                        if (!token) return;
                        try {
                            const verified_user = jwt.verify(token, process.env.JWT_SECRET);
                            return verified_user;
                        } catch (error) {
                            console.log("NAG ERR")
                            console.log(error)
                            return;
                        }
                    }

                },

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
                            // const brokerLicenseNumberFound = await this.adapter.findOne({
                            //     broker_license_number: entity.broker_license_number,
                            //     position: "Broker" // TODO: add condition email_verified
                            // });
                            // if (brokerLicenseNumberFound) {
                            //     console.log('INSIDE REGISTER');
                            //     if(brokerLicenseNumberFound._id != entity._id){
                            //         console.log('BROKER FOUND');
                            //         console.log('LICENSE NUMBER:' + brokerLicenseNumberFound.broker_license_number);
                            //         return {
                            //             success: false,
                            //             error_type: "broker_exist",
                            //             status: "Broker already exist",
                            //         };
                            //     }
                            // }


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
                            let finalSalesperson = <any>[];

                            let salesperson = await this.adapter.find({
                                query: {
                                    broker_license_number: entity.broker_license_number,
                                    position: "Salesperson"
                                }
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
                        // entity.token = crypto.randomBytes(50 / 2).toString("hex");

                        const doc = await this.adapter.insert(entity);
                        const json = await this.transformDocuments(ctx, ctx.params, doc);
                        await this.entityChanged("created", json, ctx);
                        // broker.call("email_verification.createAndSendEmailVerification", { email: json.email, user_id: json._id }).catch(e => {console.log("err in creating email_verification"); console.log(e)})

                        json.token = await broker.call("users.generateJWToken", {user_object: json});
                        
                        //welcom email here
                        let html:any = await fs.readFile(`${process.cwd()}/templates/email/welcome_email.html`, 'utf8');
                            let final_html = html.replace("{user_firstname}",entity.firstname);
                                        
                            await broker.call("notify.notifyToEmail", {
                                email:entity.email,
                                subject: "Dazle Welcome Email",
                                content: final_html
                                // content: `Hello there! Just click the link below to verify your email <hr><hr> <a href="${process.env.DOMAIN_NAME}/email-verify/${email}/${token}">Click Here</a> `
                            });


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
                                // const foundInvited = await this.adapter.findOne({
                                //     invites: {
                                //         $elemMatch: {
                                //             email: auth.email,
                                //             invited: true
                                //         }
                                //     }
                                // });

                                // if ( foundInvited ) {
                                    const json = await this.transformDocuments(ctx, ctx.params, found);
                                    await this.entityChanged("updated", json, ctx);
                                    json.token = await broker.call("users.generateJWToken", {user_object: json});

                                    return { success: true, user: json, status: "Login success" };
                                // }

                                // return { success: false, error_type: "pending", user: auth, status: "Your account status is currently pending" };
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

                        if (!entity.email) {
                            return { success: false, error_type: "missing_data", status: "No email found." };
                        }

                        const found = await this.adapter.findOne({
                            email: entity.email,
                        });

                        if (found) {
                            // check user required fields on social logins
                            if( found.mobile_number && found.position) {
                                // check if user is invited
                                const foundInvited = await this.adapter.findOne({
                                    invites: {
                                        $elemMatch: {
                                            email: found.email,
                                            invited: true
                                        }
                                    }
                                });

                                // if ( foundInvited ) {
                                    const json = await this.transformDocuments(ctx, ctx.params, found);
                                    await this.entityChanged("updated", json, ctx);
                                    json.token = await broker.call("users.generateJWToken", {user_object: json});

                                    return { success: true, user: json, status: "Social login Success" };
                                // }

                                // return { success: false, error_type: "pending", user: found, status: "Your account status is currently pending" };
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
                                    entity.email_verified = true;


                                    const doc = await this.adapter.insert(entity);
                                    const json = await this.transformDocuments(ctx, ctx.params, doc);
                                    await this.entityChanged("created", json, ctx);
                                    json.token = await broker.call("users.generateJWToken", {user_object: json});

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
                                    entity.email_verified = true;

                                    const doc = await this.adapter.insert(entity);
                                    const json = await this.transformDocuments(ctx, ctx.params, doc);
                                    await this.entityChanged("created", json, ctx);
                                    json.token = await broker.call("users.generateJWToken", {user_object: json});

                                    return { user: json, success: true, status: "facebook login Success" };

                                }
                                else {
                                    return { success: false, error_type: "facebook_login_fail", status: "Facebook login failed" };
                                }
                            } else if (entity.login_type === "apple") {
                                try {
                                    const resp = await verifyAppleIdToken({
                                        // idToken: 'eyJraWQiOiJZdXlYb1kiLCJhbGciOiJ SUzI1NiJ9.eyJpc3MiOiJodHRwczovL2FwcGxlaWQuYXBwbGUuY29tIiwiYXVkIjoiY29tLmJyb29reS5kYXpsZSIsImV4cCI6MTY1NjA0NzQxNywiaWF0IjoxNjU1OTYxMDE3LCJzdWIiOiIwMDAzNDkuZTEwMTNhMTA4MTEyNDU1ZWI3Nzg3NDIwN2FlNTQ5MzAuMTM0NiIsImNfaGFzaCI6IjV6c2NwZ21URW9pSmNNWkhlUnpyckEiLCJlbWFpbCI6ImtpbmdpZWRnQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjoidHJ1ZSIsImF1dGhfdGltZSI6MTY1NTk2MTAxNywibm9uY2Vfc3VwcG9ydGVkIjp0cnVlfQ.L7uXAFupiXWbW30Ro6-Yy6Wxc75133HGCKAegDw3fEOllGFTcOEfe-nR31A-eVX50QEafdKmN5Lk5PtoYLRMF8I8MX1xhPU2oDoN9PkliKXfnDNcrugQpyUJPteL0ZmgRhvYZSpOuaVnIb-VuvQYZ1OMpyUQletmyjrxhfLGAuo2HtUNvtRZVAc5_QzxVclSu1vpbRjIMT0RoBXo_qRiRQesKoUxd82_B4SGKSySLSTxDphdw4Q90pHTqkunFi42Sagote3i9UmN_hV0KPZTvYQ0lBQjVmJzw4qj633jIM9PaB9De2Dtl9YD6XcOWVEHOs-lZSvDMtlyE0mAuoCc0A',
                                        idToken: entity.token,
                                        clientId: 'com.brooky.dazle'
                                    });

                                    console.log("resp")
                                    console.log(resp)
                                    const other_details = entity.otherDetails
                                    if (resp) {
                                        entity.firstname = other_details ? entity.otherDetails.firstName || "" : "";
                                        entity.lastname = other_details ? entity.otherDetails.lastName || "" : "";
                                        entity.is_new_user = true;
                                        entity.email_verified = true;
    
                                        const doc = await this.adapter.insert(entity);
                                        const json = await this.transformDocuments(ctx, ctx.params, doc);
                                        await this.entityChanged("created", json, ctx);
                                        json.token = await broker.call("users.generateJWToken", {user_object: json});
    
                                        return { user: json, success: true, status: "Apple login Success" };
    
                                    }
                                } catch (error) {
                                    console.log(error)
                                    return { success: false, error_type: "apple_login_fail", status: "Apple login failed"};
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
                                // if (brokerFound){
                                //     // send request invite to broker
                                //     await this.adapter.updateById(
                                //         brokerFound._id,
                                //         {
                                //             $push: {
                                //                 invites: {
                                //                     invited: false,
                                //                     email: entity.email, // salesperson email
                                //                     date_modified: new Date()
                                //                 }
                                //             }
                                //         }
                                //     );
                                // }
                            }
                            else if ( entity.position == "Broker" ) {
                                // check broker license number
                                // const brokerLicenseNumberFound = await this.adapter.findOne({
                                //     broker_license_number: entity.broker_license_number,
                                //     position: "Broker"
                                // });
                                // if (brokerLicenseNumberFound) {
                                //     if(brokerLicenseNumberFound._id != entity._id){
                                //         return {
                                //             success: false,
                                //             error_type: "broker_exist",
                                //             status: "Broker already exist",
                                //         };
                                //     }
                                // }


                                // // check admin
                                // const adminFound = await this.adapter.findOne({
                                //     broker_license_number: "1234567890",
                                //     position: "Broker"
                                // });

                                // if ( adminFound ) {
                                //     // send request invite to admin
                                //     await this.adapter.updateById(
                                //         adminFound._id,
                                //         {
                                //             $push: {
                                //                 invites: {
                                //                     invited: false,
                                //                     email: entity.email, // broker email
                                //                     date_modified: new Date()
                                //                 }
                                //             }
                                //         }
                                //     );
                                // }

                                // // check all data that have position of salesperson and the same broker license number
                                // // add salesperson that already registered before the broker
                                // let finalSalesperson = <any>[];

                                // let salesperson = await this.adapter.find({
                                //     query: {
                                //         broker_license_number: entity.broker_license_number,
                                //         position: "Salesperson"
                                //     }
                                // });

                                // if (salesperson) {
                                //     salesperson.forEach( (data: any) => {
                                //         finalSalesperson.push({
                                //             invited: false,
                                //             email: data.email
                                //         });
                                //     });
                                //     // console.log(salesperson, finalSalesperson);

                                //     entity.invites = finalSalesperson; // add salesperson to the broker
                                // }
                            }

                            const doc = await this.adapter.updateById(
                                found._id,
                                {
                                    $set: entity
                                }
                            );
                            const json = await this.transformDocuments(ctx, ctx.params, doc);
                            await this.entityChanged("updated", json, ctx);
                            json.token = await broker.call("users.generateJWToken", {user_object: json});
                           
                            let html:any = await fs.readFile(`${process.cwd()}/templates/email/welcome_email.html`, 'utf8');
                            let final_html = html.replace("{user_firstname}",entity.firstname);
                                        
                            await broker.call("notify.notifyToEmail", {
                                email:entity.email,
                                subject: "Dazle Welcome Email",
                                content: final_html
                                // content: `Hello there! Just click the link below to verify your email <hr><hr> <a href="${process.env.DOMAIN_NAME}/email-verify/${email}/${token}">Click Here</a> `
                            });
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
                            if ( entity.position == "Salesperson" ) {
                                // check salesperson broker
                                const brokerFound = await this.adapter.findOne({
                                    broker_license_number: entity.broker_license_number,
                                    position: "Broker"
                                });
                                
                            }
                            else if ( entity.position == "Broker" ) {
                                // check broker license number
                                const brokerLicenseNumberFound = await this.adapter.findOne({
                                    broker_license_number: entity.broker_license_number,
                                    position: "Broker"
                                });
                                if (brokerLicenseNumberFound) {
                                    if(brokerLicenseNumberFound._id != entity._id){
                                        return {
                                            success: false,
                                            error_type: "broker_exist",
                                            status: "Broker already exist",
                                        };
                                    }
                                    
                                }
                            }

                            const doc = await this.adapter.updateById(
                                found._id,
                                {
                                    $set: {
                                        firstname: entity.firstname,
                                        lastname: entity.lastname,
                                        mobile_number: entity.mobile_number,
                                        about_me: entity.about_me,
                                        profile_picture: entity.profile_picture,
                                        broker_license_number: entity.broker_license_number
                                    
                                    }
                                }
                            );
                            const json = await this.transformDocuments(ctx, ctx.params, doc);
                            await this.entityChanged("updated", json, ctx);

                            return { success: true, user: json, status: "Update Success" };
                        }

                        return { success: false, error_type: "not_found", status: "Update Fail" };
                    }
                },
                updateEmailVerification: {
                    async handler(ctx) {
                        console.log(`IDIDID ${ctx.params.user_id}`)
                        const updatedUser = await this.adapter.updateById(
                            ctx.params.user_id,
                            {
                                $set: {
                                    email_verified: ctx.params.verified
                                }
                            }
                        );
                        return await this.transformDocuments(ctx, ctx.params, updatedUser);
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
