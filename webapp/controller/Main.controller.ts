import BaseController from "./BaseController";
import MessageBox from "sap/m/MessageBox";

/**
 * @namespace btpoc.controller
 */
export default class Main extends BaseController {
	public sayHello(): void {
		MessageBox.show("Hello World!");
	}
}
