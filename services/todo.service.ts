"use strict";

import {Service, ServiceBroker, Context} from "moleculer";


var todoArray = new Array();


export default class TodoService extends Service {

	public constructor(public broker: ServiceBroker) {
		super(broker);
        
		this.parseServiceSchema({
			name: "todo",
			actions:{
                /**
                 * Add todo
                 *
                 * @param {String} id - todo id
                 * @param {String} todo - todo name
                 * @param {Boolean} check - check todo
                 */
                addTodo: {
                    rest: {
                        method: "POST",
                        path: "/add"
                    },
                    params: {
                        id: "string",
                        todo: "string",
                        check: "boolean",
                    },
                    /** @param {Context} ctx  */
                    async handler(ctx) {
                        todoArray.push({
                            id: ctx.params.id,
                            todo: ctx.params.todo,
                            check: ctx.params.check
                        });

                        return todoArray;
                    }
                },
                /**
                 * Read todo
                 *
                 * @returns
                 */
                readTodo: {
                    rest: {
                        method: "GET",
                        path: "/read"
                    },
                    async handler() {
                        return todoArray;
                    }
                },
                /**
                 * Update todo
                 *
                 * @param {String} id - todo id
                 * @param {String} newTodo -  new todo name
                 * @param {String} newCheck -  new check todo
                 */
                updateTodo: {
                    rest: {
                        method: "PUT",
                        path: "/update"
                    },
                    params: {
                        id: "string",
                        newTodo: "string",
                        newCheck: "boolean"
                    },
                    /** @param {Context} ctx  */
                    async handler(ctx) {
                        var index = todoArray.findIndex((obj => obj.id == ctx.params.id));
                        if(index == -1){
                            return "Todo data not found.";
                        }

                        todoArray[index].todo = ctx.params.newTodo;
                        todoArray[index].check = ctx.params.newCheck;
                        return todoArray;
                    }
                },
                /**
                 * Delete todo
                 *
                 * @param {String} id - todo id
                 */
                deleteTodo: {
                    rest: {
                        method: "DELETE",
                        path: "/delete"
                    },
                    params: {
                        id: "string"
                    },
                    /** @param {Context} ctx  */
                    async handler(ctx) {
                        var index = todoArray.findIndex((obj => obj.id == ctx.params.id));
                        if(index == -1){
                            return "Todo data not found.";
                        }

                        todoArray.splice(index, 1);
                        return todoArray;
                    }
                }
			},
		});
	}
}
