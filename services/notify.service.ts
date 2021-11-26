"use strict";
import {Service, ServiceBroker, Context} from "moleculer";
import dotenv from "dotenv";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MailService = require("moleculer-mail");
dotenv.config();


export default class NotifyService extends Service{

	public constructor(public broker: ServiceBroker) {
		super(broker);
		this.parseServiceSchema({
			name: "notify",
			mixins: [MailService],
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

						// send email to broker
						if ( email ) {
							this.send({
								to: email,
								subject: "Dazle App Invitation",
								html: "Click <a href=\"https://play.google.com/store/apps/details?id=com.brooky.rcdlandinc\">here</a> to register in our app.",
							});

							is_email = true;
						}

						// send sms to broker
						if ( mobileNumber ) {
						}


						return {
							success: ( is_email || is_mobile_number ) ? true : false,
							is_email: is_email,
							is_mobile_number: is_mobile_number,
							status: "Success"
						};

					},
				}

			},
		});
	}
}
