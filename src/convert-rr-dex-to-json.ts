import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

export const RR_HTML_PATH = './html';
export const RR_JSON_PATH = './json';

interface RRBuild {
	name: string;
	recommendation: string;
	nature: string;
	evs: {
		HP: number;
		ATK: number;
		DEF: number;
		SPE: number;
		SPA: number;
		SPD: number;
	};
	ability: string;
	teraType: string;
	heldItem: string;
	moveset: string[];
}

const game8StatToBuildStat = {
	HP: 'HP',
	Atk: 'ATK',
	Def: 'DEF',
	Spe: 'SPE',
	'Sp.Atk': 'SPA',
	'Sp.Def': 'SPD',
};

const extractBuilds = (document: Document) => {
	return Array.from(document.querySelectorAll<HTMLTableRowElement>('#hl_2 + table tr'))
		.slice(1)
		.map(tr => {
			const tdNodes = tr.querySelectorAll<HTMLTableCellElement>('td');
			const href = tdNodes[0].querySelector<HTMLAnchorElement>('a').href;
			const id = href.substring(href.lastIndexOf('#'));
			const name = tdNodes[0].textContent;
			const recommendation = tdNodes[1].textContent.trim();

			const pokemonBuild: RRBuild = {
				name,
				recommendation,
				nature: '',
				evs: {
					HP: 0,
					ATK: 0,
					DEF: 0,
					SPE: 0,
					SPA: 0,
					SPD: 0,
				},
				ability: '',
				teraType: '',
				heldItem: '',
				moveset: [],
			};

			Array.from(document.querySelectorAll<HTMLTableRowElement>(`${id} + table tr`)).forEach(tr => {
				const typeCell = tr.querySelector<HTMLTableCellElement>('th');
				const valueCell = tr.querySelector<HTMLTableCellElement>('td');
				if (!typeCell || !valueCell) {
					return;
				}
				const dataType = typeCell.textContent.trim();
				const dataValue = valueCell.textContent.trim();
				switch (dataType) {
					case 'Nature':
						pokemonBuild.nature = dataValue.split(' ')[0];
						break;
					case 'EV Spread': {
						dataValue
							.split('/')
							.map(stat => stat.trim().match(/^([^0-9]*)([0-9]+)([^0-9]*)$/))
							.filter(Boolean)
							.forEach(([_, name1, value, name2]) => {
								const name = (name1 || name2).replace(/\s/g, '');
								const statName = game8StatToBuildStat[name];
								pokemonBuild.evs[statName] = Number(value);
							});
						break;
					}
					case 'Ability':
						pokemonBuild.ability = dataValue.replace(/\s/g, '');
						break;
					case 'Tera Type': {
						const altText = valueCell.querySelector<HTMLImageElement>('img').alt;
						pokemonBuild.teraType = altText.match('Pokemon (.*) Type Icon')[1];
						break;
					}
					case 'Held Item':
						pokemonBuild.heldItem = dataValue;
						break;
					case 'Moveset': {
						pokemonBuild.moveset = Array.from(
							valueCell.querySelectorAll<HTMLAnchorElement>('a'),
						).map(anchor => anchor.textContent.replace(/\s/g, ''));
						break;
					}
				}
			});

			if (!pokemonBuild.moveset.length) {
				// link to build is not parsable
				return null;
			}

			return pokemonBuild;
		})
		.filter(Boolean);
};

const result = {};
fs.readdirSync(RR_HTML_PATH).forEach(filePath => {
	const { name } = path.parse(filePath);
	console.log(`Extracting builds for ${name}`);

	const dom = fs.readFileSync(path.join(RR_HTML_PATH, filePath));
	const window = new JSDOM(dom).window;
	const { document } = window;
	result[name] = extractBuilds(document);

	console.log(`Extraction finished for ${name}\n\n`);
	window.close(); // close the jsdom
});

if (!fs.existsSync(RR_JSON_PATH)) {
	fs.mkdirSync(RR_JSON_PATH);
}

const rrDexFilePath = path.join(RR_JSON_PATH, `rr-dex.json`);
fs.writeFileSync(rrDexFilePath, JSON.stringify(result, null, 2));
console.log(`RR builds saved in ${rrDexFilePath}\n`);
