"use strict";

import {Service, ServiceBroker, Context} from "moleculer";
import dotenv from "dotenv";
import HTTPClientService from "moleculer-http-client";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const MailService = require("moleculer-mail");
dotenv.config();


export default class NotifyService extends Service{

	public constructor(public broker: ServiceBroker) {
		super(broker);
		this.parseServiceSchema({
			name: "notify",
			mixins: [MailService, HTTPClientService],
			settings: {
                JWT_SECRET: process.env.JWT_SECRET || "jwt-secret",

                /** MAIL **/
                from: "no-reply@brooky.io",
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
			},
			actions:{
				/**
				 * Notify Broker for dazle app by email or sms.
				 *
				 * @param {String} email - email
				 * @param {String} mobile_number - mobile number (optional)
				 */
				notifyUser: {
					rest: {
						method: "POST",
						path: "/notify-user",
					},
					params: {
                        email: { type: "string" },
						mobile_number: { type: "string" },
                    },
					async handler(ctx) {
						let is_email = false;
						let is_mobile_number = false;

						const email = ctx.params.email;
						const mobileNumber = ctx.params.mobile_number;

						// send email to user
						if ( email ) {
							this.send({
								to: email,
								subject: "Dazle App Invitation",
								html: "Click <a href=\"https://play.google.com/store/apps/details?id=com.brooky.rcdlandinc\">here</a> to register in our app.",
							});

							is_email = true;
						}

						// send sms to user
						if ( mobileNumber ) {
							var response = await this._post("https://portal.bulkgate.com/api/1.0/simple/promotional",{
								json: {
									application_id: process.env.SMS_APP_ID,
									application_token: process.env.SMS_APP_TOKEN,
									number: mobileNumber,
									text: "Dazle App Invitation\n\nClick https://play.google.com/store/apps/details?id=com.brooky.rcdlandinc to register in the app.",
									sender_id: "6272",
									sender_id_value: "BROOKY"
								}
							});

							is_mobile_number = response != null ? true : false;
						}


						return {
							is_email: is_email,
							is_mobile_number: is_mobile_number,
							success: ( is_email || is_mobile_number ) ? true : false,
							error_type: ( is_email || is_mobile_number ) ? "" : "not_sent",
							status: ( is_email || is_mobile_number ) ? "Success" : "Failed",
						};

					},
				},
				notifyToMobile: {
					params: {
						mobile_number: "string",
						message: "string"
					},
					async handler(ctx) {
						const mobileNumber = ctx.params.mobile_number;
						const message = ctx.params.message;

						if (message && mobileNumber) {
							try {
								const response = await this._post("https://portal.bulkgate.com/api/1.0/simple/promotional",{
									json: {
										application_id: process.env.SMS_APP_ID,
										application_token: process.env.SMS_APP_TOKEN,
										number: mobileNumber,
										text: message,
										sender_id: "6272",
										sender_id_value: "BROOKY"
									}
								});
								return {success: ( response ) ? true : false, status: ( response ) ? "Success" : "Failed"}
							} catch (error) {
								return {success: false, status: "Failed"}
							}
						}
					}
				},
				notifyToEmail: {
					params: {
						email: "string",
						subject: "string",
						content: "string"
					},
					async handler(ctx) {
						const email = ctx.params.email;
						const subject = ctx.params.subject;
						const content = ctx.params.content;
						if (email){
							console.log("SEND EMAIL")
							try {
								const response = await this.send({
									to: email,
									subject: subject,
									html: content,
								});
								console.log(response)
								return {success: ( response ) ? true : false, status: ( response ) ? "Success" : "Failed"}
							} catch (error) {
								return {success: false, status: "Failed"}
							}
						}
					}
				}

			},
		});
	}
}
