import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, Vault } from 'obsidian';
import JiraApi from 'jira-client';
import * as Eta from 'eta';

interface Issue {
	key: string;
	self: string;
	fields: {
		summary: string;
		description: string;
	}
}
interface MyPluginSettings {
	token: string;
	host: string;
	templateFilePath: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	token: '',
	host: '',
	templateFilePath: ''
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	jira: JiraApi;

	async onload() {
		await this.loadSettings();

		const jira = new JiraApi({
			protocol: 'https',
			host: this.settings.host,
			bearer: this.settings.token,
			apiVersion: '2',
			strictSSL: false
		});

		const hydrateTemplate = async (templateFile: TFile, issue: Issue): Promise<string | void> => {
			const host = issue.self.substring(0, issue.self.indexOf("/rest/"))
			const uiLink = host + "/browse/" + issue.key
			const template = await templateFile.vault.read(templateFile)

			const t = {
				link: uiLink,
			}

			// Allow all issue properties to be templated
			Object.assign(t, issue)

			return Eta.render(template, t) as string | void
		}

		const getIssueById = async (jira: JiraApi, issueId: string): Promise<Issue> => {
			var issue = null
			try {
				issue = await jira.findIssue(issueId)
				console.log(`Status: ${issue.fields.status.name}`);
			} catch (err) {
				console.error(err)
			}
			return issue as Issue
		}

		const addIssueContentsToFile = async (file: TFile, templateFilePath: string, issue: Issue) => {
			const template = file.vault.getAbstractFileByPath(templateFilePath) as TFile
			const hydratedTemplate = await hydrateTemplate(template, issue)
			if (hydrateTemplate) {
				file.vault.modify(file, hydratedTemplate as string)
			} else {
				console.error("Sadness")
			}
		}

		this.addCommand({
			id: 'jira-hydrate-ticket',
			name: 'Add Jira issue info',
			callback: async () => {
				const activeFile = this.app.workspace.getActiveFile()
				// Trim '.md' from filename
				const activeFilename = activeFile.name.substr(0, activeFile.name.length - 3)
				const jiraIssue = await getIssueById(jira, activeFilename)
				if (jiraIssue != null) {
					console.debug(`Filename ${activeFilename} matches Jira issue number!`)
					addIssueContentsToFile(activeFile as TFile, this.settings.templateFilePath, jiraIssue)
				}
			}
		});

		// Hook for when a file is renamed
		this.app.vault.on("rename", async function(file, _oldName) {
			// Trim .md
		})

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		let statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		let {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		let {contentEl} = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for Jira.'});

		new Setting(containerEl)
			.setName('Host')
			.setDesc('Jira hostname')
			.addText(text => text
				.setPlaceholder('jira.example.com')
				.setValue(this.plugin.settings.host)
				.onChange(async (value) => {
					this.plugin.settings.host = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Jira PAT')
			.setDesc('Personal Access Token. Generate by going to Profile -> Personal Access Tokens.')
			.addText(text => text
				.setValue(this.plugin.settings.token)
				.onChange(async (value) => {
					this.plugin.settings.token = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Issue Template')
			.setDesc('Path to template file which will be hydrated with Jira issue contents')
			.addText(text => text
				.setValue(this.plugin.settings.templateFilePath)
				.onChange(async (value) => {
					this.plugin.settings.templateFilePath = value;
					await this.plugin.saveSettings();
				}));
	}
}
