"use strict";
import {Context, Service, ServiceBroker, ServiceSchema} from "moleculer";
const { MoleculerError } = require("moleculer").Errors;
import fs from 'fs';
import AWS from 'aws-sdk';

import { formatDistanceToNow } from "date-fns";
export default class ConnectionService extends Service{
	
	// @ts-ignore
	public  constructor(public broker: ServiceBroker, schema: ServiceSchema<{}> = {}) {
		super(broker);

		this.parseServiceSchema(Service.mergeSchemas({
			name: "s3",
			// mixins: [this.DbMixin],
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
				logging: true
			},
			hooks: {
				before: {
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
                uploadFileFromBase64: {
                    rest: {
                        method: "POST",
                        path: "/upload-file-from-base64"
                    },
                    params: {
						filename: { type: "string" },
						base64: { type: "string" }
                    },
					async handler(ctx) {
						//testttt pa need some s3 configuration to read url publicly
						const filename = ctx.params.filename
						const base64 = ctx.params.base64
						console.log(process.env.AWS_ACCESS_KEY, process.env.AWS_SECRET_ACCESS_KEY)
						const s3 = new AWS.S3({
							accessKeyId: process.env.AWS_ACCESS_KEY,
							secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
							region: "ap-southeast-1"
						});
						const buffered_file = Buffer.from(base64, "base64");
						s3.upload({
							Bucket: 'brooky-attachments', // pass your bucket name
							Key: filename, // file will be saved as testBucket/contacts.csv
							Body: buffered_file
						}, function(s3Err: any, data: any) {
							if (s3Err) throw s3Err
							console.log(`File uploaded successfully at ${data.Location}`)
						});

						// const params = {
						// 	Bucket: 'brooky-attachments', // pass your bucket name
						// 	Key: 'filename', // file will be saved as testBucket/contacts.csv
						// 	Body: JSON.stringify(data, null, 2)
						// };
						
						return { success: true, status: "Got My Listings", file_url: "" };
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
