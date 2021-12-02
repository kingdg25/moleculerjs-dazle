"use strict";
import {Context, Service, ServiceBroker, ServiceSchema} from "moleculer";

import DbConnection from "../mixins/db.mixin";

export default class ConnectionService extends Service{

	private DbMixin = new DbConnection("users").start();

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
				 */
                 readInvite: {
					rest: {
						method: "POST",
						path: "/read-invite",
					},
					params: {
                        email: { type: "string" },
                    },
					async handler(ctx) {
                        const finalInvites = [];

                        const found = await this.adapter.findOne({
                            email: ctx.params.email,
                        });

                        if (found) {
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

                                if ( agentFound ) {
                                    finalInvites.push({
                                        _id: agentFound._id,
                                        firstname: agentFound.firstname,
                                        lastname: agentFound.lastname,
                                        total_connection: 'x',
                                        photo_url: agentFound.photo_url
                                    });
                                }
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
				 */
                 readMyConnection: {
					rest: {
						method: "POST",
						path: "/read-my-connection",
					},
					params: {
                        email: { type: "string" },
                    },
					async handler(ctx) {
                        const finalMyConnection = [];

                        const found = await this.adapter.findOne({
                            email: ctx.params.email,
                        });

                        if (found) {
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
                                        photo_url: agentFound.photo_url,
                                        position: agentFound.position,
                                        date_connected: agentFound.date_connected
                                    });
                                }
                            }

                            return { success: true, my_connection: finalMyConnection, status: "Success" };
                        }

                        return { success: false, error_type: "not_found", status: "Fail" };
						// return {
                        //     success: true,
                        //     my_connection: [
                        //         {
                        //             _id: '1',
                        //             firstname: 'my',
                        //             lastname: 'name',
                        //             total_connection: '3',
                        //             position: 'asd'
                        //         },
                        //         {
                        //             _id: '2',
                        //             firstname: 'first1',
                        //             lastname: 'last1',
                        //             total_connection: '32',
                        //             position: 'xf'
                        //         },
                        //         {
                        //             _id: '3',
                        //             firstname: 'xer2',
                        //             lastname: 'cis3',
                        //             total_connection: '41',
                        //             position: 'salesperson'
                        //         },
                        //         {
                        //             _id: '4',
                        //             firstname: 'sil444',
                        //             lastname: 'lao',
                        //             total_connection: '28',
                        //             position: 'broker'
                        //         },
                        //         {
                        //             _id: '5',
                        //             firstname: 'qwe',
                        //             lastname: 'asd',
                        //             total_connection: '231',
                        //             position: 'broookers'
                        //         }
                        //     ]
                        // };

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
                            _id: userId
                        });

                        const invitedFound = await this.adapter.findOne({
                            _id: invitedId
                        });

                        if ( userFound && invitedFound ) {
                            // check user invites if the invited is exist or not
                            const isUserInvitesExist = (userFound.invites) ? userFound.invites.some( (invite: any) => {
                                return invite.email === invitedFound.email;
                            }) : false;
                            // console.log('isUserInvitesExist', isUserInvitesExist);

                            if( isUserInvitesExist ) {
                                const finalUserInvites = userFound.invites.map( (invite: any) => {
                                    if ( invite.email === invitedFound.email ) {
                                        invite.invited = true;
                                    }
                                    return invite;
                                });
                                // console.log('finalUserInvites', finalUserInvites);

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
