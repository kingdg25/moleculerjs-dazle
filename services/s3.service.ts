"use strict";
import {Context, Service, ServiceBroker, ServiceSchema, Errors} from "moleculer";
const { MoleculerError } = require("moleculer").Errors;
import fs from 'fs';
import AWS from 'aws-sdk';
import { formatDistanceToNow } from "date-fns";

const mime = require('mime-types')
const randomstring = require("randomstring");

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
						const filename = ctx.params.filename
						const base64 = ctx.params.base64
						let file_url = "";
						const s3 = new AWS.S3({
							accessKeyId: process.env.AWS_ACCESS_KEY,
							secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
							region: "ap-southeast-1"
						});
						const buffered_file = Buffer.from(base64, "base64");
						const date_ = new Date();
						const randString = randomstring.generate({
							length: 8,
							capitalization: "uppercase"
						  })
						let upload_res: any = await s3.upload({
							Bucket: 'brooky-attachments', // pass your bucket name
							Key: `dazle/${date_.getFullYear()}/${date_.getMonth()+1}/${date_.getDate()}/${randString}_${filename}`, // file will be saved as testBucket/contacts.csv
							Body: buffered_file,
							ContentType: mime.lookup(filename),
							ACL: "public-read"
						}, await function(s3Err: any, data: any) {
							if (s3Err) throw s3Err
						}).promise().then((d) => {
							file_url = d.Location;
							return;
						}).catch(e => {
							throw new MoleculerError("Fail to Upload", 400, "Upload Error", { success: false, error_type: "file_upload_error", status: "Fail to upload file." });
						});

						if (!file_url) throw new MoleculerError("Fail to Upload", 400, "Upload Error", { success: false, error_type: "file_upload_error", status: "Fail to upload file." });
						
						return { success: true, status: "S3 Upload Successfully", data: { file_url: file_url } };
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
