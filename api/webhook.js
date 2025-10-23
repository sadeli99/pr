// api/webhook.js
const fetchLib = require('node-fetch');
const { Redis } = require('@upstash/redis');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const CREDENTIALS_URL = process.env.CREDENTIALS_URL;
const MAIL_VIEW_URL = process.env.MAIL_VIEW_URL || 'https://nikahin.xyz/mail.html';

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

    const mainKeyboard = {
      keyboard: [
        [{ text: '/get 🎁 Ambil Akun Premium' }],
        [{ text: '✉️ Ambil Email OTP', web_app: { url: MAIL_VIEW_URL } }],
        [{ text: '/tutorial 📖 Panduan' }, { text: '/info ℹ️ Info' }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    };

    if (text === '/start') {
      await tgSend(
        chatId,
        `<b>👋 Selamat Datang di Bot Berbagi Akun Premium!</b>\n\n` +
          `🎁 Dapatkan akun premium secara gratis dan acak.\n` +
          `💡 Setiap pengguna hanya bisa ambil 1 akun sekali saja.\n\n` +
          `Gunakan tombol di bawah untuk mulai:\n\n` +
          `• /get – Ambil akun premium\n` +
          `• ✉️ Ambil Email OTP – Buka inbox email untuk menerima OTP\n` +
          `• /tutorial – Cara penggunaan\n` +
          `• /info – Tentang bot ini`,
        mainKeyboard
      );
      return res.status(200).send('ok');
    }

    if (text.startsWith('/get')) {
      const claimed = await redis.get(userKey);
      if (claimed) {
        await tgSend(chatId, '⚠️ Kamu sudah pernah generate akun. 1x saja per user.', mainKeyboard);
        return res.status(200).send('ok');
      }

      const accounts = await fetchAccounts();
      if (accounts.length === 0) {
        await tgSend(chatId, '❌ Tidak ada akun tersedia sekarang.', mainKeyboard);
        return res.status(200).send('ok');
      }

      const account = pickRandom(accounts);
      await redis.set(userKey, JSON.stringify(account));

      await tgSend(
        chatId,
        `✅ <b>Akun premium kamu:</b>\n\n` +
          `📧 Email: <code>${account.email}</code>\n` +
          `🔑 Password: <code>${account.password}</code>\n\n` +
          `Jangan bagikan ke publik ya! 🔒`,
        mainKeyboard
      );
      return res.status(200).send('ok');
    }

    // 🔹 Bagian tutorial diubah sesuai permintaanmu
    if (text.startsWith('/tutorial')) {
      await tgSend(
        chatId,
        `📖 <b>Tutorial Login Akun Premium:</b>\n\n` +
          `1️⃣ Pertama, klik tombol <b>/get</b> untuk mendapatkan <b>Email dan Password</b> akun premium kamu.\n\n` +
          `2️⃣ Setelah itu, buka situs web premium (contoh: <code>https://example.premium</code>).\n\n` +
          `3️⃣ Login ke web premium tersebut menggunakan <b>Email dan Password</b> yang sudah kamu dapatkan dari bot.\n\n` +
          `4️⃣ Biasanya web premium akan meminta kode <b>OTP</b> untuk verifikasi.\n\n` +
          `5️⃣ Buka tombol <b>✉️ Ambil Email OTP</b> di bawah ini atau langsung ke: ${MAIL_VIEW_URL}\n` +
          `   Di sana kamu bisa melihat inbox dan mengambil kode OTP.\n\n` +
          `6️⃣ Masukkan kode OTP tersebut ke website premium untuk menyelesaikan login.\n\n` +
          `✅ Selesai! Sekarang kamu sudah bisa menikmati akun premium secara sharing.`,
        mainKeyboard
      );
      return res.status(200).send('ok');
    }

    if (text.startsWith('/info')) {
      await tgSend(
        chatId,
        `ℹ️ <b>Tentang Bot Ini:</b>\n\n` +
          `Bot ini dibuat untuk membagikan akun premium secara acak.\n` +
          `Akun bersifat <b>sharing</b> dan legal dibagikan.\n\n` +
          `💻 Dibuat oleh: <b>@usernamekamu</b>\n` +
          `🔗 Cek inbox OTP: ${MAIL_VIEW_URL}`,
        mainKeyboard
      );
      return res.status(200).send('ok');
    }

    await tgSend(chatId, 'Gunakan tombol di bawah untuk mulai 👇', mainKeyboard);
    res.status(200).send('ok');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error');
  }
};
