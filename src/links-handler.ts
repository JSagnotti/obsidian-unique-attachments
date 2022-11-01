import { App, TAbstractFile, TFile, EmbedCache, LinkCache, Pos } from 'obsidian';
import { Utils } from './utils';
import { path } from './path';

export interface PathChangeInfo {
	oldPath: string,
	newPath: string,
}

export interface EmbedChangeInfo {
	old: EmbedCache,
	newLink: string,
}

export interface LinkChangeInfo {
	old: LinkCache,
	newLink: string,
}

export interface LinksAndEmbedsChangedInfo {
	embeds: EmbedChangeInfo[]
	links: LinkChangeInfo[]
}



//simple regex
// const markdownLinkOrEmbedRegexSimple = /\[(.*?)\]\((.*?)\)/gim
// const markdownLinkRegexSimple = /(?<!\!)\[(.*?)\]\((.*?)\)/gim;
// const markdownEmbedRegexSimple = /\!\[(.*?)\]\((.*?)\)/gim

// const wikiLinkOrEmbedRegexSimple = /\[\[(.*?)\]\]/gim
// const wikiLinkRegexSimple = /(?<!\!)\[\[(.*?)\]\]/gim;
// const wikiEmbedRegexSimple = /\!\[\[(.*?)\]\]/gim

//with escaping \ characters
// const markdownLinkOrEmbedRegexG = /(?<!\\)\[(.*?)(?<!\\)\]\((.*?)(?<!\\)\)/gim
const markdownLinkOrEmbedRegexCompatible = /(\\)?\[(.*?)(\\)?\]\((.*?)(\\)?\)/gim

function getElements(text: string, regex:RegExp) {

	const elements = [];
	let result;
	while (result = regex.exec(text)) {
		elements.push(`[${result[2]}](${result[4]})`);
	}
	return elements;
}

export class LinksHandler {

	constructor(
		private app: App,
		private consoleLogPrefix: string = ""
	) { }

	getFileByPath(path: string): TFile {
		path = Utils.normalizePathForFile(path);
		let files = this.app.vault.getFiles();
		let file = files.find(file => Utils.normalizePathForFile(file.path) === path);
		return file;
	}


	getFullPathForLink(link: string, owningNotePath: string): string {
		link = Utils.normalizePathForFile(link);
		owningNotePath = Utils.normalizePathForFile(owningNotePath);

		let parentFolder = owningNotePath.substring(0, owningNotePath.lastIndexOf("/"));
		let fullPath = path.join(parentFolder, link);

		fullPath = Utils.normalizePathForFile(fullPath);
		return fullPath;
	}



	async updateChangedPathInNote(notePath: string, oldLink: string, newLink: string, changelinksAlt = false) {
		let changes: PathChangeInfo[] = [{ oldPath: oldLink, newPath: newLink }];
		return await this.updateChangedPathsInNote(notePath, changes, changelinksAlt);
	}


	async updateChangedPathsInNote(notePath: string, changedLinks: PathChangeInfo[], changelinksAlt = false) {
		let file = this.getFileByPath(notePath);
		if (!file) {
			console.error(this.consoleLogPrefix + "cant update links in note, file not found: " + notePath);
			return;
		}

		let text = await this.app.vault.read(file);
		let dirty = false;

		let elements = getElements(text, markdownLinkOrEmbedRegexCompatible);
		if (elements != null && elements.length > 0) {
			for (let el of elements) {
				let alt = el.match(/\[(.*?)\]/)[1];
				let link = el.match(/\((.*?)\)/)[1];

				let fullLink = this.getFullPathForLink(link, notePath);

				for (let changedLink of changedLinks) {
					if (fullLink == changedLink.oldPath) {
						let newRelLink: string = path.relative(notePath, changedLink.newPath);
						newRelLink = Utils.normalizePathForLink(newRelLink);

						if (newRelLink.startsWith("../")) {
							newRelLink = newRelLink.substring(3);
						}

						if (changelinksAlt && newRelLink.endsWith(".md")) {
							let ext = path.extname(newRelLink);
							let baseName = path.basename(newRelLink, ext);
							alt = Utils.normalizePathForFile(baseName);
						}

						text = text.replace(el, '[' + alt + ']' + '(' + newRelLink + ')')

						dirty = true;

						console.log(this.consoleLogPrefix + "link updated in note [note, old link, new link]: \n   "
							+ file.path + "\n   " + link + "\n   " + newRelLink)
					}
				}
			}
		}

		if (dirty)
			await this.app.vault.modify(file, text);
	}


	async getNotesThatHaveLinkToFile(filePath: string): Promise<string[]> {
		let notes: string[] = [];
		let allNotes = this.app.vault.getMarkdownFiles();

		if (allNotes) {
			for (let note of allNotes) {
				let notePath = note.path;

				let links = await this.getLinksFromNote(notePath);

				for (let link of links) {
					let linkFullPath = this.getFullPathForLink(link.link, notePath);
					if (linkFullPath == filePath) {
						if (!notes.contains(notePath))
							notes.push(notePath);
					}
				}
			}
		}

		return notes;
	}


	getFilePathWithRenamedBaseName(filePath: string, newBaseName: string): string {
		return Utils.normalizePathForFile(path.join(path.dirname(filePath), newBaseName + path.extname(filePath)));
	}


	async getLinksFromNote(notePath: string): Promise<LinkCache[]> {
		let file = this.getFileByPath(notePath);
		if (!file) {
			console.error(this.consoleLogPrefix + "cant get embeds, file not found: " + notePath);
			return;
		}

		let text = await this.app.vault.read(file);

		let links: LinkCache[] = [];

		let elements = getElements(text, markdownLinkOrEmbedRegexCompatible);
		if (elements != null && elements.length > 0) {
			for (let el of elements) {
				let alt = el.match(/\[(.*?)\]/)[1];
				let link = el.match(/\((.*?)\)/)[1];

				let emb: LinkCache = {
					link: link,
					displayText: alt,
					original: el,
					position: {
						start: {
							col: 0,//todo
							line: 0,
							offset: 0
						},
						end: {
							col: 0,//todo
							line: 0,
							offset: 0
						}
					}
				};

				links.push(emb);
			}
		}
		return links;
	}

}
