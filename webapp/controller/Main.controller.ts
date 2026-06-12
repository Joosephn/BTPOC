import BaseController from "./BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v2/ODataModel";
import PDFViewer from "sap/m/PDFViewer";
import Button, { Button$PressEvent } from "sap/m/Button";
import Dialog from "sap/m/Dialog";
import Fragment from "sap/ui/core/Fragment";
import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
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

// SuccessFactors MDF entity: cust_EmployeeDocument
// Fields must match the MDF object definition in SF Admin Center
interface SFDocumentEntity {
	externalCode: string;
	externalName_defaultValue: string;
	cust_description: string;
	startDate: string;            // OData v2 DateTime: /Date(timestamp)/
	cust_documentType: string;    // Enum: "payslip" | "contract" | "myflex"
	cust_documentUrl: string;
	userId: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Shown as fallback when the SF OData endpoint is unreachable (local dev / no destination configured).
// One example per document type so the UI remains exercisable without a live backend.
const MOCK_DOCUMENTS: DocumentItem[] = [
	{ id: "mock-1", name: "Payslip - January 2026",    description: "Monthly payslip",            date: "31 Jan 2026", type: "payslip",  url: "https://www.africau.edu/images/default/sample.pdf" },
	{ id: "mock-2", name: "Employment Contract",        description: "Standard employment agreement", date: "01 Mar 2025", type: "contract", url: "https://www.africau.edu/images/default/sample.pdf" },
	{ id: "mock-3", name: "myFlex - Q1 2026",           description: "Flexible benefits statement", date: "31 Mar 2026", type: "myflex",   url: "https://www.africau.edu/images/default/sample.pdf" }
];

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
		// Seed with mock examples immediately so each tab has visible content before SF responds
		const oDocModel = new JSONModel({ documents: [...MOCK_DOCUMENTS], filteredDocuments: [], busy: false });
		this.getView()?.setModel(oDocModel, "documents");

		void this.getResourceBundle().then(bundle => {
			this._oBundle = bundle;
		});

		this._filterDocuments();
		this._loadDocuments();
	}

	private _getSFModel(): ODataModel {
		return this.getOwnerComponent().getModel("sfsf") as ODataModel;
	}

	private _loadDocuments(): void {
		const oDocModel = this.getView()!.getModel("documents") as JSONModel;
		oDocModel.setProperty("/busy", true);

		let bTimedOut = false;

		const oHandle = this._getSFModel().read("/cust_EmployeeDocument", {
			success: (oData: { results: SFDocumentEntity[] }) => {
				clearTimeout(iTimeoutId);
				const sfDocs: DocumentItem[] = oData.results.map(e => ({
					id: e.externalCode,
					name: e.externalName_defaultValue,
					description: e.cust_description,
					date: this._formatSFDate(e.startDate),
					type: e.cust_documentType,
					url: e.cust_documentUrl
				}));
				// Merge: mock examples first, then real SF documents after
				oDocModel.setProperty("/documents", [...MOCK_DOCUMENTS, ...sfDocs]);
				oDocModel.setProperty("/busy", false);
				this._filterDocuments();
			},
			error: () => {
				clearTimeout(iTimeoutId);
				if (bTimedOut) return; // abort() triggered this — already handled by the timeout
				// SF unreachable for a non-timeout reason — mock examples remain visible
				oDocModel.setProperty("/busy", false);
			}
		}) as { abort: () => void };

		// If SF has not responded within 15 seconds, abort the request and notify the user
		const iTimeoutId = window.setTimeout(() => {
			bTimedOut = true;
			oHandle.abort();
			oDocModel.setProperty("/busy", false);
			MessageBox.error(
				this._oBundle?.getText("sfTimeout") ??
				"Unable to retrieve your documents from SuccessFactors storage. Please try again later.",
				{ title: "Connection Timeout" }
			);
		}, 15000);
	}

	// SF OData v2 returns DateTime as /Date(milliseconds)/
	private _formatSFDate(sDate: string): string {
		const match = /\/Date\((\d+)\)\//.exec(sDate);
		if (!match) return sDate;
		const d = new Date(Number(match[1]));
		return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
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
		const files = oEvent.getParameter("files") as unknown as FileList;
		if (files?.length > 0) {
			this._oSelectedFile = files[0];
			const sName = files[0].name.replace(/\.pdf$/i, "");
			(this.getView()!.getModel("uploadDialog") as JSONModel).setProperty("/docName", sName);
		}
	}

	public onUploadConfirm(): void {
		const oDialogModel = this.getView()!.getModel("uploadDialog") as JSONModel;
		oDialogModel.setProperty("/docNameState", "None");

		const sDocName = (oDialogModel.getProperty("/docName") as string).trim();
		let bValid = true;

		if (!sDocName) {
			oDialogModel.setProperty("/docNameState", "Error");
			bValid = false;
		}

		if (!this._oSelectedFile) {
			MessageToast.show(this._oBundle?.getText("uploadValidateFile") ?? "Please select a PDF file.");
			bValid = false;
		}

		if (!bValid) return;

		const sDescription = this._sActiveTab.charAt(0).toUpperCase() + this._sActiveTab.slice(1);

		this._getSFModel().create("/cust_EmployeeDocument", {
			externalCode: String(Date.now()),
			externalName_defaultValue: sDocName,
			cust_description: sDescription,
			startDate: new Date().toISOString(),
			cust_documentType: this._sActiveTab,
			cust_documentUrl: ""
			// Binary file upload requires the SF Document Management / ECM API
		}, {
			success: () => {
				this._loadDocuments();
				this._oUploadDialog?.close();
				MessageToast.show(this._oBundle?.getText("uploadSuccess") ?? "Document uploaded.");
			},
			error: () => {
				MessageToast.show(this._oBundle?.getText("uploadError") ?? "Upload failed.");
			}
		});
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
