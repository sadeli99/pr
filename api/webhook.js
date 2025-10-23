// api/webhook.js
const fetchLib = require('node-fetch');
const { Redis } = require('@upstash/redis');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const CREDENTIALS_URL = process.env.CREDENTIALS_URL;

const redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });

async function tgSend(chatId, text) {
  await fetchLib(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function fetchAccounts() {
  const res = await fetchLib(CREDENTIALS_URL);
  if (!res.ok) throw new Error('Gagal ambil credentials');
  const data = await res.json();
  return data.accounts || [];
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).send('Only POST');

    const update = req.body;
    const message = update.message;
    if (!message) return res.status(200).send('No message');

    const chatId = message.chat.id;
    const tgId = message.from.id;
    const text = message.text?.trim().toLowerCase();

    const userKey = `user:${tgId}:claimed`;
    const claimed = await redis.get(userKey);

    if (claimed) {
      await tgSend(chatId, '⚠️ Kamu sudah pernah generate akun. 1x saja per user.');
      return res.status(200).send('ok');
    }

    if (!text.startsWith('/get')) {
      await tgSend(chatId, 'Kirim /get untuk mendapatkan akun premium (1x per user).');
      return res.status(200).send('ok');
    }

    const accounts = await fetchAccounts();
    if (accounts.length === 0) {
      await tgSend(chatId, '❌ Tidak ada akun tersedia sekarang.');
      return res.status(200).send('ok');
    }

    const account = pickRandom(accounts);
    const email = account.email || '-';
    const password = account.password || '-';

    await redis.set(userKey, JSON.stringify(account));

    await tgSend(
      chatId,
      `✅ Akun premium kamu:\n\nEmail: ${email}\nPassword: ${password}\n\nJangan bagikan ke publik ya!`
    );

    return res.status(200).send('ok');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error');
  }
};
