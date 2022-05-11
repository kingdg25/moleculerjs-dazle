"use strict";
import {Context, Service, ServiceBroker, ServiceSchema} from "moleculer";
const { MoleculerError } = require("moleculer").Errors;
const selectPhilippinesAddress = require("select-philippines-address"); 
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
					time_period: { type: "string", optional: true, default: () => "" }, // yearly or monthly
					number_of_bedrooms: {type: "number", convert: true,  optional: true, default: 0  },
					// number_of_bathrooms: { type: "string", convert: true, integer: true, default: () => 0 },
					number_of_bathrooms: { type: "number", convert: true,  optional: true, default: 0  },
					number_of_parking_space: { type: "string" },
					total_area: { type: "number", convert: true, positive: true, default: 0.0 },
					is_your_property: { type: "string", optional: true, default: () => ""  },  // is the property furnished ? or not ?
					district: { type: "string", optional: true },
					city: { type: "string" },
					landmark: { type: "string", optional: true },
					title: { type: "string", optional: true, default: () => "" },
					description: { type: "string", optional: true, default: () => "" },
					createdBy: { type: "string" }, // user id
					view_type: { type: "string", optional: false, default: "public" }, //public or private
					coordinates: { type: "object", optional: true, default: () =>  {} },
					location: { type: "object", optional: true, default: () =>  {} },
					pricing : { type: "string", optional: true, default: () => ""  },
					frontage_area: { type: "number", convert: true, positive: true, optional: true, default: 0.0 },
					floor_area: { type: "number", convert: true, positive: true, optional: true, default: 0.0 },
					ownership: { type: "string", optional: true, default: () => ""  },
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

				// gi creatan(override) nako ug mga following/other method ang mga basic REST APIs(POST,GET,PUT,DELETE) with empty function, para dili siya mahilabtan like (maka post(create), get(get), PUT(update) etc) publicly.
				list: {async handler(ctx) {}},
				create: {async handler(ctx) {}},
				remove: {async handler(ctx) {}},
				// update: {async handler(ctx) {}},

				// --- ADDITIONAL ACTIONS ---
				get: {
					async handler(ctx) {
						const id = ctx.params.id;
						const current_user = ctx.meta.user;

                        let doc = await this.adapter.findOne({
                            _id: new ObjectID(id)
						});
						if (doc) {
							if (doc.createdBy==current_user._id || doc.view_type=="public") {
								const json = await this.transformDocuments(ctx, ctx.params, doc);
								return {success: true, listing: doc, status: "Listing fetched."}
							}
							// else if (await has_connections(current_user, user_connection)) {
								// TODO: kung naa nay connections
							// }
							else return { success: false, error_type: "not_allowed", status: "It seems the user is not allowed to view this listing." };
						} else return { success: false, error_type: "not_found", status: "It seems the listing is not available." };
					}
				},
				getRegions: {
					rest: {
                        method: "GET",
                        path: "/regions"
                    },
					async handler(){
						var regions = await selectPhilippinesAddress.regions();
						// var regions;
						// selectPhilippinesAddress.regions().then((region: any) => regions = region);
						console.log(regions);
						return { success: true, status: "Got My Regions", regions: regions };
					}
				},
				getProvinces: {
					rest: {
                        method: "GET",
                        path: "/provinces"
                    },
					params: {
						region_id: {type: "string"}
					},
					async handler(ctx){
						var provinces = await selectPhilippinesAddress.provinces(ctx.params.region_id);
						
						console.log(provinces);
						return { success: true, status: "Got My Provinces", provinces: provinces };
					}
				},
				getCities: {
					rest: {
                        method: "GET",
                        path: "/cities"
                    },
					params: {
						province_id: {type: "string"}
					},
					async handler(ctx){
						var cities = await selectPhilippinesAddress.cities(ctx.params.province_id);
						
						console.log(cities);
						return { success: true, status: "Got My Cities", cities: cities };
					}
				},
				getBarangays: {
					rest: {
                        method: "GET",
                        path: "/barangays"
                    },
					params: {
						city_id: {type: "string"}
					},
					async handler(ctx){
						var barangays = await selectPhilippinesAddress.barangays(ctx.params.city_id);
						
						console.log(barangays);
						return { success: true, status: "Got My Cities", barangays: barangays };
					}
				},
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
						// const isAuthenticated: any = await broker.call("users.isAuthenticated", { token: ctx.params.user_token});

						// if ('success' in isAuthenticated) {
						// 	if (!isAuthenticated.success) this.authenticationError();
						// } else {this.authenticationError()}

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
							},
							sort: { createdAt: -1 },
						});

						return { success: true, status: "Got My Listings", listings: my_listings };
                    }
                },
                getListingInProfile: {
                    rest: {
                        method: "GET",
                        path: "/get-listings-in-profile/:user_id/:viewer_id"
                    },
                    params: {
						user_id: { type: "string" },
						viewer_id: { type: "string" }
                    },
					async handler(ctx) {
						let listings: Array<Object> = [];
						const user_id = ctx.params.user_id; // user to fetch listing
						const viewer_id = ctx.params.viewer_id;
						if (user_id===viewer_id) { // add more validation when authorization is enabled, validate if ctx.meta.user is equal to user_id
							listings = await this.adapter.find({
								query: {
									createdBy: user_id
								},
								sort: { createdAt: -1 },
							});
						} else {
							const has_connections = true;
							// if viewer is not the user and the viewer has connection with user, get all the public listing of a user
							if (has_connections) {
								listings = await this.adapter.find({
									query: {
										createdBy: user_id,
										view_type: "public"
									},
									sort: { createdAt: -1 },
									// limit: 5
								});
							}
						}

						return { success: true, status: "Listings Fetch", listings: listings, length: listings.length };
                    }
				},
				// override the update method or the "PUT" REST API
                update: {
                    rest: {
                        method: "PUT",
                        path: "/update-listing/:id"
					},
					params: {
						id: "string",
						data: "object"
					},
					async handler(ctx) {
						const listing_id = ctx.params.id; // listing id
						const data = ctx.params.data;
						const current_user = ctx.meta.user;

                        const listing = await this.adapter.findOne({
                            _id: new ObjectID(listing_id)
						});
						if (listing) {
							if (listing.createdBy === current_user._id) {
								const doc = await this.adapter.updateById(
									listing._id,
									{
										$set: data
									}
								);
								const json = await this.transformDocuments(ctx, ctx.params, doc);
								await this.entityChanged("updated", json, ctx);
								return { success: true, listing: json, status: "Update Success" };
							} else return { success: false, error_type: "not_allowed", status: "It seems the user is not allowed to update this listing." };
						}
						return { success: false, error_type: "not_found", status: "Update Fail" };
					}
				},
				deleteListing: {
					rest: {
                        method: "DELETE",
                        path: "/delete-listing/:id"
					},
					params: {
						id: "string"
					},
					async handler(ctx) {
						const id = ctx.params.id;
						const current_user = ctx.meta.user;

                        let listing = await this.adapter.findOne({
                            _id: new ObjectID(id)
						});
						if (listing) {
							if (listing.createdBy==current_user._id) {
								const doc = await this.adapter.removeById(id);
								if (doc){
								const json = await this.transformDocuments(ctx, ctx.params, doc);
								return {success: true, deletedListing: doc, status: "Listing deleted."}
								} else return { success: false, error_type: "delete_error", status: "An error occured while trying to delete the listing." };

							}
							else return { success: false, error_type: "not_allowed", status: "It seems the user is not allowed to delete this listing." };
						} else return { success: false, error_type: "not_found", status: "It seems the listing is not available." };
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
