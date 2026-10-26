// Busca pedidos na Shopify e anúncios na Meta: npm run sincronizar (no servidor, a cada hora pelo cron).
import {sincronizarShopify} from '../lib/shopify';
import {sincronizarMeta} from '../lib/meta';

(async () => {
  for (const f of [sincronizarShopify, () => sincronizarMeta(Number(process.argv[2]) || 3)]) {
    try { console.log((await f()).msg); } catch (e) { console.error(`Erro: ${(e as Error).message}`); process.exitCode = 1; }
  }
})();
