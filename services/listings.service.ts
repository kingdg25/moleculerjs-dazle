"use strict";
import {Context, Service, ServiceBroker, ServiceSchema} from "moleculer";
const { MoleculerError } = require("moleculer").Errors;

import { formatDistanceToNow } from "date-fns";
import DbConnection from "../mixins/db.mixin";


const ObjectID = require("mongodb").ObjectID;


export default class ConnectionService extends Service{

	private DbMixin = new DbConnection("listings").start();

	public authenticationError() {
		throw new MoleculerError("Fail to authenticate", 401, "Unauthorized", { success: false, error_type: "not_found", status: "Fail to authenticate" });
		return;
	}
	// @ts-ignore
	public  constructor(public broker: ServiceBroker, schema: ServiceSchema<{}> = {}) {
		super(broker);

		this.parseServiceSchema(Service.mergeSchemas({
			name: "listings",
			mixins: [this.DbMixin],
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
                // fields: [
                //     "_id"
                // ],
				logging: true,
				entityValidator: {
					cover_photo: { type: "string", optional: true},
					photos: {
                        type: "array",
                        optional: true,
                        items: {
                            type: "string"
                        },
						default: []
                    },
					amenities: {
                        type: "array",
                        optional: true,
                        items: {
                            type: "string"
                        },
						default: []
                    },
					keywords: {
                        type: "array",
                        optional: true,
                        items: {
                            type: "string"
						},
						default: []
                    },
					price: { type: "number", convert: true, positive: true, default: 0.0 },
					time_period: { type: "string" }, // Sell or Rent
					number_of_bedrooms: { type: "string" },
					// number_of_bathrooms: { type: "string", convert: true, integer: true, default: () => 0 },
					number_of_bathrooms: { type: "string" },
					number_of_parking_space: { type: "string" },
					total_area: { type: "string" },
					is_your_property: { type: "string" },  // is the property furnished ? or not ?
					district: { type: "string", optional: true },
					city: { type: "string" },
					landmark: { type: "string", optional: true },
					description: { type: "string", optional: true, default: () => "" },
					createdBy: { type: "string" }, // user id
					view_type: { type: "string", optional: false, default: "public" }, //public or private
                    createdAt: { type: "date", default: () => new Date() },
                    updatedAt: { type: "date", default: () => new Date() },
				  }
			},
			hooks: {
				before: {
					/**
					 * Register a before hook for the `create` action.
					 * It sets a default value for the quantity field.
					 *
					 * @param {Context} ctx
					 */
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
                createListing: {
                    rest: {
                        method: "POST",
                        path: "/create-listing"
                    },
                    params: {
						property: { type: "object" },
						user_token: { type: "string" }
                    },
					async handler(ctx) {
						// console.log(ctx);
						const isAuthenticated: any = await broker.call("users.isAuthenticated", { token: ctx.params.user_token});
						// console.log(isAuthenticated)
						if ('success' in isAuthenticated) {
							if (!isAuthenticated.success) this.authenticationError();
						} else {this.authenticationError()}

						//create listing
						console.log(ctx.params.property);
						const property = ctx.params.property;
						await this.validateEntity(property);
						
						const doc = await this.adapter.insert(property);
                        const json = await this.transformDocuments(ctx, ctx.params, doc);
						await this.entityChanged("created", json, ctx);
						
						console.log(json);

						return { success: true, status: "Listing Created", property: json };
                    }
                },
                myListings: {
                    rest: {
                        method: "GET",
                        path: "/my-listings"
                    },
                    params: {
						user_id: { type: "string" }
                    },
					async handler(ctx) {
						const listings = [];
						const uid = ctx.params.user_id
						
						// get user
						await broker.call("users.get", { id: (uid)})

						// get my listings
						let my_listings = await this.adapter.find({
							query: {
								createdBy: uid
							}
						});
						
						return { success: true, status: "Got My Listings", listings: my_listings };
                    }
                }

			},
			methods: {
				/**
				 * Loading sample data to the collection.
				 * It is called in the DB.mixin after the database
				 * connection establishing & the collection is empty.
				 */
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
