// api/webhook.js
const fetchLib = require('node-fetch');
const { Redis } = require('@upstash/redis');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const CREDENTIALS_URL = process.env.CREDENTIALS_URL;

const redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });

async function tgSend(chatId, text, keyboard) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  };
  if (keyboard) body.reply_markup = keyboard;

  await fetchLib(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

    // 📦 Tombol utama di bawah chat
    const mainKeyboard = {
      keyboard: [
        [{ text: '/get 🎁 Ambil Akun' }],
        [{ text: '/tutorial 📖 Panduan' }, { text: '/info ℹ️ Info' }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    };

    // 🟢 Pesan sambutan awal
    if (text === '/start') {
      await tgSend(
        chatId,
        `<b>👋 Selamat Datang di Bot Berbagi Akun Premium!</b>\n\n` +
          `🎁 Dapatkan akun premium secara gratis dan acak.\n` +
          `💡 Setiap pengguna hanya bisa ambil 1 akun sekali saja.\n\n` +
          `Gunakan tombol di bawah untuk mulai:\n` +
          `• /get – Ambil akun premium\n` +
          `• /tutorial – Cara penggunaan\n` +
          `• /info – Tentang bot ini`,
        mainKeyboard
      );
      return res.status(200).send('ok');
    }

    // 🟢 Perintah /get
    if (text.startsWith('/get')) {
      const claimed = await redis.get(userKey);
      if (claimed) {
        await tgSend(chatId, '⚠️ Kamu sudah pernah generate akun. 1x saja per user.');
        return res.status(200).send('ok');
      }

      const accounts = await fetchAccounts();
      if (accounts.length === 0) {
        await tgSend(chatId, '❌ Tidak ada akun tersedia sekarang.');
        return res.status(200).send('ok');
      }

      const account = pickRandom(accounts);
      await redis.set(userKey, JSON.stringify(account));

      await tgSend(
        chatId,
        `✅ <b>Akun premium kamu:</b>\n\n` +
          `📧 Email: <code>${account.email}</code>\n` +
          `🔑 Password: <code>${account.password}</code>\n\n` +
          `Jangan bagikan ke publik ya! 🔒`
      );
      return res.status(200).send('ok');
    }

    // 🟢 Perintah /tutorial
    if (text.startsWith('/tutorial')) {
      await tgSend(
        chatId,
        `📖 <b>Tutorial Penggunaan:</b>\n\n` +
          `1️⃣ Klik /get untuk mengambil akun premium.\n` +
          `2️⃣ Salin email dan password yang diberikan.\n` +
          `3️⃣ Login ke situs streaming premium.\n\n` +
          `⚠️ Ingat, setiap user hanya bisa ambil 1x akun.`
      );
      return res.status(200).send('ok');
    }

    // 🟢 Perintah /info
    if (text.startsWith('/info')) {
      await tgSend(
        chatId,
        `ℹ️ <b>Tentang Bot Ini:</b>\n\n` +
          `Bot ini dibuat untuk berbagi akun premium secara acak.\n` +
          `Semua akun bersifat <b>sharing</b> dan legal dibagikan oleh pemilik akun.\n\n` +
          `💻 Dibuat oleh: <b>@usernamekamu</b>\n` +
          `❤️ Gunakan dengan bijak dan jangan disebarluaskan.`
      );
      return res.status(200).send('ok');
    }

    // 🔸 Jika user kirim teks lain
    await tgSend(chatId, 'Gunakan tombol di bawah untuk mulai 👇', mainKeyboard);
    res.status(200).send('ok');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error');
  }
};
