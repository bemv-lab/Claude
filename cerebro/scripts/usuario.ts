// Cria ou troca a senha de um usuário: npm run usuario -- <email> <nome> <senha>
import {db} from '../lib/db';
import {hashSenha} from '../lib/senha';

const [email, nome, senha] = process.argv.slice(2);
if (!email || !nome || !senha || senha.length < 8) {
  console.error('Uso: npm run usuario -- <email> <nome> <senha com 8+ caracteres>');
  process.exit(1);
}
db().prepare('INSERT INTO usuarios (email, nome, senha) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET nome = excluded.nome, senha = excluded.senha')
  .run(email.toLowerCase().trim(), nome, hashSenha(senha));
console.log(`Usuário ${email} pronto.`);
