"use strict";
import {Context, Service, ServiceBroker, ServiceSchema} from "moleculer";
const { MoleculerError} = require("moleculer").Errors;

import { formatDistanceToNow } from "date-fns";
import Dbconnetion from "../mixins/db.mixin";

const ObjectID = require("mongodb").ObjectID;

export default class ConnectionService extends Service{
    
    private DbMixin = new Dbconnetion("feedbacks").start();

    public authenticationError() {
        throw new MoleculerError("Faul to autneticate", 401, "Unauthorized", {sucess: false, error_type: "not_fount", status: "Fail to authenticate "});
        return;
    }
    //@ts-ignore
    public constructor(public broker: ServiceBroker, shcema: ServiceSchame<{}> = {}) {
        super(broker);

        this.parseServiceSchema(Service.mergeSchemas({
            name: "feedbacks",
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
                logging: true,
                entityValidator: {
                    user_id: { type: "string" },
                    user_display_name: { type: "string" },
                    likes: { type: "string" },
                    improvements: { type: "string" },
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
                createFeedback: {
                    rest: {
                        method: "POST",
                        path: "/create-feedback"
                    },
                    params: {
                        feedback: {type: "object"}
                    },
                    async handler(ctx) {
                        console.log(ctx.params.feedback);
                        const feedback = ctx.params.feedback;
                        await this.validateEntity(feedback);

                        const doc = await this.adapter.insert(feedback);
                        const json = await this.transformDocuments(ctx, ctx.params, doc);
                        await this.entityChanged("created", json, ctx);

                        console.log(json);
                        return {sucess: true, status: "Feedback Created", property: json};
                    }
                },
            }
        }, shcema));
    }
}
