import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

export const BR_HTML_PATH = './html';
export const BR_JSON_PATH = './json';

interface BRBuild {
	name?: string;
	recommendation?: string;
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

function fixEVs(pokemonBuild: BRBuild) {
	const total =
		pokemonBuild.evs.HP +
		pokemonBuild.evs.ATK +
		pokemonBuild.evs.DEF +
		pokemonBuild.evs.SPE +
		pokemonBuild.evs.SPA +
		pokemonBuild.evs.SPD;
	if (total <= 510) {
		return;
	}
	console.log('fix EVs for ' + pokemonBuild.name);
	// get the closest extra value
	const diff = total - 510;
	const closest = Object.entries(pokemonBuild.evs).reduce(
		(closest, [key, value]) => {
			const distance = value - diff;
			if (distance >= 0 && distance < closest.distance) {
				return { key, value, distance };
			}
			return closest;
		},
		{ key: '', value: 0, distance: Number.MAX_VALUE },
	);
	console.log(closest);
	if (closest.key) {
		pokemonBuild.evs[closest.key] = closest.value - diff;
	}
}

function extractStats(document: Document, headerId: string) {
	const pokemonBuild: BRBuild = {
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

	Array.from(document.querySelectorAll<HTMLTableRowElement>(`${headerId} + table tr`)).forEach(
		tr => {
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
					// fix EVs more than 512
					fixEVs(pokemonBuild);
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
					pokemonBuild.heldItem = dataValue.split('\n')[0];
					break;
				case 'Moveset': {
					pokemonBuild.moveset = Array.from(valueCell.querySelectorAll<HTMLAnchorElement>('a'))
						.map(anchor => anchor.textContent.replace(/\s/g, '').replace(/-/g, ''))
						.filter(Boolean);
					break;
				}
			}
		},
	);

	if (!pokemonBuild.moveset.length) {
		// link to build is not parsable
		return null;
	}

	return pokemonBuild;
}

function extractFromIteration(document: Document) {
	let index = 1;
	let header = document.querySelector(`#hm_${index}`);
	const result = [];
	while (header) {
		result.push(extractStats(document, `#hm_${index}`));

		index++;
		header = document.querySelector(`#hm_${index}`);
	}
	return result.filter(Boolean);
}

function extractFromIndex(document: Document, headerId) {
	return Array.from(document.querySelectorAll<HTMLTableRowElement>(`${headerId} + table tr`))
		.slice(1)
		.map(tr => {
			const tdNodes = tr.querySelectorAll<HTMLTableCellElement>('td');
			const href = tdNodes[0].querySelector<HTMLAnchorElement>('a').href;
			const id = href.substring(href.lastIndexOf('#'));
			const name = tdNodes[0].textContent;
			const recommendation = tdNodes[1].textContent.trim();

			const stats = extractStats(document, id);
			return stats
				? {
						name,
						recommendation,
						...stats,
				  }
				: null;
		})
		.filter(Boolean);
}

const result = [];
fs.readdirSync(BR_HTML_PATH).forEach(filePath => {
	const { name } = path.parse(filePath);

	console.log(`Extracting builds for ${name}`);

	const dom = fs.readFileSync(path.join(BR_HTML_PATH, filePath));
	const window = new JSDOM(dom).window;
	const { document } = window;

	const pokemonBuilds = { name, builds: [] };
	// most of the pages have the index at id=hl_2
	pokemonBuilds.builds = extractFromIndex(document, '#hl_2');
	if (!pokemonBuilds.builds.length) {
		// some pages have the index at id=hl_3
		pokemonBuilds.builds = extractFromIndex(document, '#hl_3');
	}
	if (!pokemonBuilds.builds.length) {
		// other pages don't have index, we iterate on the tables
		pokemonBuilds.builds = extractFromIteration(document);
	}
	result.push(pokemonBuilds);

	console.log(`Extraction finished for ${name}\n\n`);
	window.close(); // close the jsdom
});

if (!fs.existsSync(BR_JSON_PATH)) {
	fs.mkdirSync(BR_JSON_PATH);
}

const brDexFilePath = path.join(BR_JSON_PATH, `br-dex.json`);
fs.writeFileSync(brDexFilePath, JSON.stringify(result, null, 2));
console.log(`BR builds saved in ${brDexFilePath}\n`);
