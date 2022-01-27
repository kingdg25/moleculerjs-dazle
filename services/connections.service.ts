"use strict";
import {Context, Service, ServiceBroker, ServiceSchema} from "moleculer";

import { formatDistanceToNow } from "date-fns";
import DbConnection from "../mixins/db.mixin";


const ObjectID = require("mongodb").ObjectID;


export default class ConnectionsService extends Service{

	private DbMixin = new DbConnection("connections").start();

	// @ts-ignore
	public  constructor(public broker: ServiceBroker, schema: ServiceSchema<{}> = {}) {
		super(broker);
		this.parseServiceSchema(Service.mergeSchemas({
			name: "connections",
			mixins: [this.DbMixin],
			settings: {
				// Available fields in the responses
                logging: true,
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
                fetchConnections: {
					rest: {
						method: "GET",
						path: "/fetch-connections/:user_id/:viewer_id",
					},
					params: {
                        user_id: { type: "string" },
                        viewer_id: { type: "string" },
                    },
                    async handler(ctx) {
                        const friends: Array<string> = [];
                        const user_id = ctx.params.user_id;
						const viewer_id = ctx.params.viewer_id;
						let profiles: Array<any> = [];
						const current_user: any = ctx.meta.user || {};
						
						if (user_id===viewer_id && viewer_id==current_user._id) { // for more security add more condition like, if viewer_id===ctx.meta.user.id(token logged from authorization)
							let docs = await this.adapter.find({
								query: {
									users: {
										$in: [user_id]
									}
								},
								sort: {_id: -1}
							});
							docs.forEach((val: any, index: any) => {
								friends.push(...val['users'].filter((val: any) => val!==user_id))
							});
							profiles = await broker.call("users.getUsersFromListOfIds", {user_ids: friends})
							return { success: true, connections: profiles, status: "Connections Fetched." };
						} else {
							// TODO: fetch other user's connections
						}
                        return { success: false, connections: profiles, status: "Empty Connection List." };
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
