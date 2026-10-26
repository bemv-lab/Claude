// Cópia consistente do banco (mesmo com o app rodando): npm run backup
// Guarda em <pasta do banco>/backups e mantém as 30 mais recentes.
import {mkdirSync, readdirSync, rmSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {db, caminhoDb} from '../lib/db';

const pasta = join(dirname(caminhoDb()), 'backups');
mkdirSync(pasta, {recursive: true});
const carimbo = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const destino = join(pasta, `cerebro-${carimbo}.db`);
db().exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
const antigos = readdirSync(pasta).filter((f) => f.startsWith('cerebro-') && f.endsWith('.db')).sort().reverse().slice(30);
for (const f of antigos) rmSync(join(pasta, f));
console.log(`Backup: ${destino}`);
