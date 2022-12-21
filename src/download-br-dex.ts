import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

const INDEX_URL = 'https://game8.co/games/Pokemon-Scarlet-Violet/archives/397804';
export const BR_HTML_PATH = './html';

(async () => {
	if (!fs.existsSync(BR_HTML_PATH)) {
		fs.mkdirSync(BR_HTML_PATH);
	}

	const res = await fetch(INDEX_URL);
	const game8IndexDom = await res.text();
	const window = new JSDOM(game8IndexDom).window;
	const { document } = window;

	Array.from(document.querySelectorAll<HTMLTableRowElement>('#hm_1 + table tr'))
		.slice(1)
		.forEach(async tr => {
			var nodes = tr.querySelectorAll<HTMLTableCellElement>('td');

			const name = nodes[0].textContent.trim();
			const link = nodes[nodes.length - 1].querySelector<HTMLAnchorElement>('a:last-child').href;

			const pokemonBuildPage = await fetch(`https://game8.co${link}`);
			const pokemonBuildPageDom = await pokemonBuildPage.text();
			const brDexFilePath = path.join(BR_HTML_PATH, `${name}.html`);
			fs.writeFileSync(brDexFilePath, pokemonBuildPageDom);
			console.log(`${name}: saved in ${brDexFilePath}\n`);
		});

	window.close(); // close the jsdom
})();
