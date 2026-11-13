#!/usr/bin/env node
// Passe des textes (JSON { id: texte } sur l'entrée standard) dans l'extracteur compilé du backend
// et écrit { id: { fields, warnings } } sur la sortie. Usage : node extract-fields.js <dist>
// où <dist> est le dossier compilé (backend/dist, après `npm run build`).
const path = require('path');
const dist = path.resolve(
  process.argv[2] || path.join(__dirname, '../../dist'),
);
const { extractContractFields } = require(
  path.join(dist, 'domain/contract-extraction/contract-extractor.js'),
);
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  const texts = JSON.parse(input);
  const out = {};
  for (const [id, text] of Object.entries(texts)) {
    out[id] = extractContractFields([text]);
  }
  process.stdout.write(JSON.stringify(out));
});
