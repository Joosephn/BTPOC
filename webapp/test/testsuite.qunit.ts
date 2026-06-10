import type {SuiteConfiguration} from "sap/ui/test/starter/config";
export default {
	name: "QUnit test suite for the UI5 Application: btpoc",
	defaults: {
		page: "ui5://test-resources/btpoc/Test.qunit.html?testsuite={suite}&test={name}",
		qunit: {
			version: 2
		},
		sinon: {
			version: 4
		},
		ui5: {
			language: "EN",
			theme: "sap_horizon"
		},
		coverage: {
			only: ["btpoc/"],
			never: ["test-resources/btpoc/"]
		},
		loader: {
			paths: {
				"btpoc": "../"
			}
		}
	},
	tests: {
		"unit/unitTests": {
			title: "Unit tests for btpoc"
		},
		"integration/opaTests": {
			title: "Integration tests for btpoc"
		}
	}
} satisfies SuiteConfiguration;
