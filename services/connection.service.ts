"use strict";
import {Context, Service, ServiceBroker, ServiceSchema} from "moleculer";

import DbConnection from "../mixins/db.mixin";
import { formatDistanceToNow } from 'date-fns';


const ObjectID = require('mongodb').ObjectID;


export default class ConnectionService extends Service{

	private DbMixin = new DbConnection("users").start();

    public async getTotalConnection(agent: any) {
        const allData = await this.adapter.find();

        let agentData = allData.filter(function(data: any) {
            return data.broker_license_number === agent.broker_license_number;
        });

        return ( agent.position === "Broker" ) ? (agentData.length-1).toString() : "1";
    }

	// @ts-ignore
	public  constructor(public broker: ServiceBroker, schema: ServiceSchema<{}> = {}) {
		super(broker);
		this.parseServiceSchema(Service.mergeSchemas({
			name: "connection",
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
				 * read invites pending of broker/agent.
				 *
				 * @param {String} email - email
                 * @param {String} filter_by_name - filter by name
				 */
                 readInvite: {
					rest: {
						method: "POST",
						path: "/read-invite",
					},
					params: {
                        email: { type: "string" },
                        filter_by_name: { type: "string", optional: true },
                    },
					async handler(ctx) {
                        let finalInvites = [];

                        const found = await this.adapter.findOne({
                            email: ctx.params.email,
                        });
                        console.log('found', found);

                        if (found && found.invites) {
                            // get list of agent who's field in invited == false
                            let invites = found.invites.filter(function(invite: any) {
                                return !invite.invited;
                            });
                            console.log(invites);

                            // get agent other info
                            for (var val of invites) {
                                const email = val.email;

                                const agentFound = await this.adapter.findOne({
                                    email: email
                                });

                                const totalConnection = await this.getTotalConnection(agentFound);

                                if ( agentFound ) {
                                    finalInvites.push({
                                        _id: agentFound._id,
                                        firstname: agentFound.firstname,
                                        lastname: agentFound.lastname,
                                        displayname: agentFound.firstname+ ' ' +agentFound.lastname,
                                        total_connection: totalConnection,
                                        photo_url: agentFound.photo_url
                                    });
                                }
                            }

                            // check filter if not empty
                            const filter_by_name = ctx.params.filter_by_name;
                            if ( filter_by_name ) {
                                finalInvites = finalInvites.filter(function(invite: any) {
                                    return invite.displayname.toLowerCase().includes(filter_by_name.toLowerCase());
                                });
                            }

                            return { success: true, invites: finalInvites, status: "Success" };
                        }

                        return { success: false, error_type: "not_found", status: "Fail" };

					},
				},

                /**
				 * read my connection that I already invited/approved.
				 *
				 * @param {String} email - email
                 * @param {String} filter_by_name - filter by name
				 */
                 readMyConnection: {
					rest: {
						method: "POST",
						path: "/read-my-connection",
					},
					params: {
                        email: { type: "string" },
                        filter_by_name: { type: "string", optional: true },
                    },
					async handler(ctx) {
                        let finalMyConnection = [];

                        const found = await this.adapter.findOne({
                            email: ctx.params.email,
                        });

                        if (found && found.invites) {
                            // get list of agent who's field in invited == true
                            let myConnection = found.invites.filter(function(invite: any) {
                                return invite.invited && ( invite.email != found.email );
                            });
                            console.log(myConnection);

                            // get agent other info
                            for (var val of myConnection) {
                                const email = val.email;

                                const agentFound = await this.adapter.findOne({
                                    email: email
                                });

                                if ( agentFound ) {
                                    finalMyConnection.push({
                                        _id: agentFound._id,
                                        firstname: agentFound.firstname,
                                        lastname: agentFound.lastname,
                                        displayname: agentFound.firstname+ ' ' +agentFound.lastname,
                                        photo_url: agentFound.photo_url,
                                        position: agentFound.position,
                                        date_modified: formatDistanceToNow(new Date(val.date_modified))
                                    });
                                }
                            }

                            // check filter if not empty
                            const filter_by_name = ctx.params.filter_by_name;
                            if ( filter_by_name ) {
                                finalMyConnection = finalMyConnection.filter(function(invite: any) {
                                    return invite.displayname.toLowerCase().includes(filter_by_name.toLowerCase());
                                });
                            }

                            return { success: true, my_connection: finalMyConnection, status: "Success" };
                        }

                        return { success: false, error_type: "not_found", status: "Fail" };

					},
				},

                /**
				 * add connection for agent.
				 *
				 * @param {String} user_id - user id
                 * @param {String} invited_id - invited id
				 */
                 addConnection: {
					rest: {
						method: "POST",
						path: "/add-connection",
					},
					params: {
                        user_id: { type: "string" },
                        invited_id: { type: "string" },
                    },
					async handler(ctx) {
                        const userId = ctx.params.user_id;
                        const invitedId = ctx.params.invited_id;

                        const userFound = await this.adapter.findOne({
                            _id: new ObjectID(userId)
                        });

                        const invitedFound = await this.adapter.findOne({
                            _id: new ObjectID(invitedId)
                        });

                        if ( userFound && invitedFound ) {
                            // check user invites if the invited is exist or not
                            const isUserInvitesExist = (userFound.invites) ? userFound.invites.some( (invite: any) => {
                                return invite.email === invitedFound.email;
                            }) : false;

                            if( isUserInvitesExist ) {
                                const finalUserInvites = userFound.invites.map( (invite: any) => {
                                    if ( invite.email === invitedFound.email ) {
                                        invite.invited = true; // add agent
                                        invite.date_modified = new Date(); // date when broker give access to salesperson
                                    }
                                    return invite;
                                });

                                // add invited user by replace the whole array with modified one
                                const doc = await this.adapter.updateById(
                                    userFound._id,
                                    {
                                        $set: {
                                            invites: finalUserInvites
                                        }
                                    }
                                );

                                const json = await this.transformDocuments(ctx, ctx.params, doc);
                                await this.entityChanged("updated", json, ctx);

                                return { success: true, broker: json, status: "Success" };
                            }

                            return { success: false, error_type: "invite_not_found", status: "Fail" };
                        }

                        return { success: false, error_type: "not_found", status: "Fail" };

					},
				},

                /**
				 * remove connection for agent.
				 *
				 * @param {String} user_id - user id
                 * @param {String} invited_id - invited id
				 */
                 removeConnection: {
					rest: {
						method: "POST",
						path: "/remove-connection",
					},
					params: {
                        user_id: { type: "string" },
                        invited_id: { type: "string" },
                    },
					async handler(ctx) {
                        const userId = ctx.params.user_id;
                        const invitedId = ctx.params.invited_id;

                        const userFound = await this.adapter.findOne({
                            _id: new ObjectID(userId)
                        });

                        const invitedFound = await this.adapter.findOne({
                            _id: new ObjectID(invitedId)
                        });

                        if ( userFound && invitedFound ) {
                            // check user invites if the invited is exist or not
                            const isUserInvitesExist = (userFound.invites) ? userFound.invites.some( (invite: any) => {
                                return invite.email === invitedFound.email;
                            }) : false;

                            if( isUserInvitesExist ) {
                                const finalUserInvites = userFound.invites.map( (invite: any) => {
                                    if ( invite.email === invitedFound.email ) {
                                        invite.invited = false; // remove agent
                                    }
                                    return invite;
                                });

                                // replace the whole array with modified one
                                const doc = await this.adapter.updateById(
                                    userFound._id,
                                    {
                                        $set: {
                                            invites: finalUserInvites
                                        }
                                    }
                                );

                                const json = await this.transformDocuments(ctx, ctx.params, doc);
                                await this.entityChanged("updated", json, ctx);

                                return { success: true, broker: json, status: "Success" };
                            }

                            return { success: false, error_type: "invite_not_found", status: "Fail" };
                        }

                        return { success: false, error_type: "not_found", status: "Fail" };

					},
				},

                /**
				 * search for user/agent.
				 *
				 * @param {String} user_id - user id
                 * @param {String} pattern - pattern string
                 * @param {Boolean} invited - invited boolean
				 */
                 searchUser: {
					rest: {
						method: "POST",
						path: "/search-user",
					},
					params: {
                        user_id: { type: "string" },
                        pattern: { type: "string" },
                        invited: { type: "boolean" },
                    },
					async handler(ctx) {
                        const userId = ctx.params.user_id;
                        const pattern = ctx.params.pattern.toLowerCase();
                        const invited = ctx.params.invited;

                        const userFound = await this.adapter.findOne({
                            _id: new ObjectID(userId)
                        });

                        if ( userFound ) {
                            // check invites array if not empty
                            if ( userFound.invites ) {
                                let finalUserInvites = [];

                                // get list of agent
                                let invites = userFound.invites.filter(function(invite: any) {
                                    return invite.invited === invited &&  ( invite.email != userFound.email );
                                });
    
                                // get agent other info
                                for (var val of invites) {
                                    const email = val.email;
    
                                    const agentFound = await this.adapter.findOne({
                                        email: email
                                    });
    
                                    if ( agentFound ) {
                                        finalUserInvites.push(agentFound.firstname+ ' ' +agentFound.lastname);
                                    }
                                }

                                let filteredFinalUserInvites = finalUserInvites.filter(function(invite: any) {
                                    return invite.toLowerCase().includes(pattern);
                                });

                                console.log(filteredFinalUserInvites);
                                return { success: true, data: filteredFinalUserInvites, status: "Success" };

                            }
                        }

                        return { success: false, error_type: "not_found", status: "Fail" };

					},
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
