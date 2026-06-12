import BaseController from "./BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import PDFViewer from "sap/m/PDFViewer";
import Button, { Button$PressEvent } from "sap/m/Button";
import Dialog from "sap/m/Dialog";
import Fragment from "sap/ui/core/Fragment";
import MessageToast from "sap/m/MessageToast";
import FileUploader from "sap/ui/unified/FileUploader";
import type { FileUploader$ChangeEvent } from "sap/ui/unified/FileUploader";
import type ResourceBundle from "sap/base/i18n/ResourceBundle";
import { IconTabBar$SelectEvent } from "sap/m/IconTabBar";
import type { SearchField$LiveChangeEvent, SearchField$SearchEvent } from "sap/m/SearchField";

interface DocumentItem {
	id: string;
	name: string;
	description: string;
	date: string;
	type: string;
	url: string;
}

const mockDocuments: DocumentItem[] = [
	{ id: "1", name: "Payslip - January 2026", description: "Monthly payslip", date: "31 Jan 2026", type: "payslip", url: "https://www.africau.edu/images/default/sample.pdf" },
	{ id: "2", name: "Payslip - February 2026", description: "Monthly payslip", date: "28 Feb 2026", type: "payslip", url: "https://www.africau.edu/images/default/sample.pdf" },
	{ id: "3", name: "Payslip - March 2026", description: "Monthly payslip", date: "31 Mar 2026", type: "payslip", url: "https://www.africau.edu/images/default/sample.pdf" },
	{ id: "4", name: "Employment Contract", description: "Standard employment agreement", date: "01 Mar 2025", type: "contract", url: "https://www.africau.edu/images/default/sample.pdf" },
	{ id: "5", name: "NDA Agreement", description: "Non-disclosure agreement", date: "15 Mar 2025", type: "contract", url: "https://www.africau.edu/images/default/sample.pdf" },
	{ id: "6", name: "myFlex - Q1 2026", description: "Flexible benefits statement", date: "31 Mar 2026", type: "myflex", url: "https://www.africau.edu/images/default/sample.pdf" },
	{ id: "7", name: "myFlex - Q4 2025", description: "Flexible benefits statement", date: "31 Dec 2025", type: "myflex", url: "https://www.africau.edu/images/default/sample.pdf" }
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * @namespace btpoc.controller
 */
export default class Main extends BaseController {
	private _oPDFViewer: PDFViewer | null = null;
	private _oUploadDialog: Dialog | null = null;
	private _oSelectedFile: File | null = null;
	private _oBundle: ResourceBundle | undefined;
	private _sSearchQuery = "";
	private _sActiveTab = "payslip";

	public onInit(): void {
		const oModel = new JSONModel({
			documents: mockDocuments,
			filteredDocuments: mockDocuments.filter((d: DocumentItem) => d.type === "payslip")
		});
		this.getView()?.setModel(oModel, "documents");

		void this.getResourceBundle().then(bundle => {
			this._oBundle = bundle;
		});
	}

	public onTabSelect(oEvent: IconTabBar$SelectEvent): void {
		this._sActiveTab = oEvent.getParameter("key") ?? "payslip";
		this._filterDocuments();
	}

	public onLiveSearch(oEvent: SearchField$LiveChangeEvent): void {
		this._applySearch(oEvent.getParameter("newValue") ?? "");
	}

	public onSearch(oEvent: SearchField$SearchEvent): void {
		this._applySearch(oEvent.getParameter("query") ?? "");
	}

	private _applySearch(sValue: string): void {
		this._sSearchQuery = sValue.toLowerCase();
		this._filterDocuments();
	}

	public onOpenPDF(oEvent: Button$PressEvent): void {
		const oButton = oEvent.getSource() as Button;
		const oContext = oButton.getBindingContext("documents");
		const sUrl = oContext?.getProperty("url") as string;
		const sName = oContext?.getProperty("name") as string;

		if (!this._oPDFViewer) {
			this._oPDFViewer = new PDFViewer();
			this.getView()?.addDependent(this._oPDFViewer);
		}

		this._oPDFViewer.setTitle(sName);
		this._oPDFViewer.setSource(sUrl);
		this._oPDFViewer.open();
	}

	public async onUploadPress(): Promise<void> {
		if (!this._oUploadDialog) {
			this._oUploadDialog = (await Fragment.load({
				id: this.getView()!.getId(),
				name: "btpoc.view.UploadDialog",
				controller: this
			})) as Dialog;
			this.getView()!.setModel(new JSONModel({ docName: "", docNameState: "None" }), "uploadDialog");
			this.getView()!.addDependent(this._oUploadDialog);
		}

		const oModel = this.getView()!.getModel("uploadDialog") as JSONModel;
		oModel.setData({ docName: "", docNameState: "None" });
		(this.byId("fileUploader") as FileUploader)?.clear();
		this._oSelectedFile = null;

		this._oUploadDialog.open();
	}

	public onFileChange(oEvent: FileUploader$ChangeEvent): void {
		const files = oEvent.getParameter("files") as FileList;
		if (files?.length > 0) {
			this._oSelectedFile = files[0];
			const sName = files[0].name.replace(/\.pdf$/i, "");
			(this.getView()!.getModel("uploadDialog") as JSONModel).setProperty("/docName", sName);
		}
	}

	public onUploadConfirm(): void {
		const oModel = this.getView()!.getModel("uploadDialog") as JSONModel;
		oModel.setProperty("/docNameState", "None");

		const sDocName = (oModel.getProperty("/docName") as string).trim();
		let bValid = true;

		if (!sDocName) {
			oModel.setProperty("/docNameState", "Error");
			bValid = false;
		}

		if (!this._oSelectedFile) {
			MessageToast.show(this._oBundle?.getText("uploadValidateFile") ?? "Please select a PDF file.");
			bValid = false;
		}

		if (!bValid) {
			return;
		}

		const sUrl = URL.createObjectURL(this._oSelectedFile!);
		const oDocsModel = this.getView()!.getModel("documents") as JSONModel;
		const aDocuments = [...(oDocsModel.getProperty("/documents") as DocumentItem[])];

		const today = new Date();
		const sDate = `${String(today.getDate()).padStart(2, "0")} ${MONTHS[today.getMonth()]} ${today.getFullYear()}`;

		aDocuments.push({
			id: String(Date.now()),
			name: sDocName,
			description: this._sActiveTab.charAt(0).toUpperCase() + this._sActiveTab.slice(1),
			date: sDate,
			type: this._sActiveTab,
			url: sUrl
		});

		oDocsModel.setProperty("/documents", aDocuments);
		this._filterDocuments();

		this._oUploadDialog?.close();
		MessageToast.show(this._oBundle?.getText("uploadSuccess") ?? "Document uploaded.");
	}

	public onUploadCancel(): void {
		this._oUploadDialog?.close();
	}

	private _filterDocuments(): void {
		const oModel = this.getView()?.getModel("documents") as JSONModel;
		const aDocuments = oModel.getProperty("/documents") as DocumentItem[];
		const aFiltered = aDocuments.filter(doc => {
			const matchesTab = doc.type === this._sActiveTab;
			const matchesSearch = !this._sSearchQuery || doc.name.toLowerCase().includes(this._sSearchQuery);
			return matchesTab && matchesSearch;
		});
		oModel.setProperty("/filteredDocuments", aFiltered);
	}
}
