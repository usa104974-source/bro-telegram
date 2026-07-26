require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "no_key" });

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🚀 БАЗА ДАННЫХ ПОДКЛЮЧЕНА, БРАТ!'))
  .catch(err => console.error('❌ Ошибка базы:', err));

// Схемы данных
const counterSchema = new mongoose.Schema({ seq: { type: Number, default: 1 } });
const Counter = mongoose.model('Counter', counterSchema);

const userSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  systemId: { type: String, required: true, unique: true },
  customId: { type: String, default: null },
  stars: { type: Number, default: 0 },
  isAdmin: { type: Boolean, default: false }
});

const auctionSchema = new mongoose.Schema({
  idForSale: { type: String, required: true },
  sellerPhone: { type: String, required: true },
  sellerName: { type: String, required: true },
  price: { type: Number, required: true }
});

const User = mongoose.model('User', userSchema);
const Auction = mongoose.model('Auction', auctionSchema);

app.use(express.static('public'));
app.use(express.json());

function isEliteId(idStr) {
  const elitePatterns = [
    /^(\d)\1{5}$/,                          
    /^(\d)\1{2}(\d)\2{2}$/,                  
    /696969|969696|112112|911911|001488|1488|525252|676767/
  ];
  return elitePatterns.some(pattern => pattern.test(idStr));
}

async function getNextSystemId() {
  let counter = await Counter.findOne();
  if (!counter) counter = await Counter.create({ seq: 1 });

  let idStr;
  do {
    idStr = counter.seq.toString().padStart(6, '0');
    counter.seq++;
  } while (isEliteId(idStr));

  await counter.save();
  return idStr;
}

function cleanPhone(phone) {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('8')) cleaned = '7' + cleaned.slice(1);
  return cleaned;
}

// Вход / Рега
app.post('/api/login', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Введи номер!' });

  const formattedPhone = cleanPhone(phone);
  let user = await User.findOne({ phone: formattedPhone });
  
  if (!user) {
    const isBoss = (formattedPhone === '79586491727');
    user = new User({
      phone: formattedPhone,
      systemId: isBoss ? '666666' : await getNextSystemId(),
      stars: isBoss ? 999999 : 0,
      isAdmin: isBoss
    });
    await user.save();
  }

  res.json(user);
});

// Аукцион API
app.get('/api/auction/list', async (req, res) => {
  const items = await Auction.find();
  res.json(items);
});

app.post('/api/auction/buy-system-id', async (req, res) => {
  const { phone, targetId } = req.body;
  const user = await User.findOne({ phone: cleanPhone(phone) });

  if (!user) return res.status(404).json({ error: 'Юзер не найден' });
  if (user.stars < 100) return res.status(400).json({ error: 'Не хватает Звёздной Пыли ✨ (нужно 100)' });

  user.stars -= 100;
  user.customId = targetId;
  await user.save();

  res.json({ success: true, customId: user.customId, stars: user.stars });
});

app.post('/api/auction/sell', async (req, res) => {
  const { phone, price } = req.body;
  const formattedPhone = cleanPhone(phone);
  const user = await User.findOne({ phone: formattedPhone});

  if (!user || !user.customId) return res.status(400).json({ error: 'У тебя нет 2-го ID для продажи!' });

  const auctionItem = new Auction({
    idForSale: user.customId,
    sellerPhone: formattedPhone,
    sellerName: user.customId,
    price: Number(price)
  });

  await auctionItem.save();
  user.customId = null;
  await user.save();

  res.json({ success: true, message: 'Лот выставлен на аукцион!' });
});

// Админка
app.post('/api/admin/give-id', async (req, res) => {
  const { adminPhone, targetPhone, newId } = req.body;
  const admin = await User.findOne({ phone: cleanPhone(adminPhone) });
  
  if (!admin || !admin.isAdmin) return res.status(403).json({ error: 'Ты не Босс!' });

  const targetUser = await User.findOne({ phone: cleanPhone(targetPhone) });
  if (targetUser) {
    targetUser.customId = newId;
    await targetUser.save();
    return res.json({ success: true, message: `Юзеру ${targetPhone} успешно выдан ID: ${newId}!` });
  }
  res.status(404).json({ error: 'Юзер не найден' });
});

app.post('/api/admin/revoke-id', async (req, res) => {
  const { adminPhone, targetPhone } = req.body;
  const admin = await User.findOne({ phone: cleanPhone(adminPhone) });
  
  if (!admin || !admin.isAdmin) return res.status(403).json({ error: 'Ты не Босс!' });

  const targetUser = await User.findOne({ phone: cleanPhone(targetPhone) });
  if (targetUser) {
    targetUser.customId = null;
    await targetUser.save();
    return res.json({ success: true, message: 'ID успешно изъят в казну!' });
  }
  res.status(404).json({ error: 'Юзер не найден' });
});

// СОКЕТЫ + АВТО-ПАТЧЕР КОДА (#РАЗРАБ)
io.on('connection', (socket) => {
  socket.on('send_message', async (data) => {
    io.emit('receive_message', data);

    if (data.chatType === 'ai') {
      try {
        let textPrompt = data.text;

        // 🔥 ЖЁСТКИЙ РЕЖИМ #РАЗРАБ (АВТО-ИЗМЕНЕНИЕ ФАЙЛОВ ПРОЕКТА)
        if (textPrompt.startsWith('#разраб')) {
          const htmlPath = path.join(__dirname, 'public', 'index.html');
          const currentHtml = fs.readFileSync(htmlPath, 'utf8');

          // БЭКАП!
          fs.writeFileSync(htmlPath + '.bak', currentHtml);

          const devPrompt = `Ты — Автоматический Модификатор Кода для BRO CHAT.
Создатель и Главный Босс — Набродов Егор.

Твоя задача: переписать фронтенд (index.html) по запросу Егора: "${textPrompt.replace('#разраб', '').trim()}".

ВЕРНИ ТОЛЬКО ПОЛНЫЙ, РАБОЧИЙ HTML КОД. Без лишних пояснений, без слов "Вот ваш код", БЕЗ оформляющих кавычек \`\`\`html.
ПРОСТО ЧИСТЫЙ HTML ТЕКСТ.

ТЕКУЩИЙ HTML КОД:
${currentHtml}`;

          const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: devPrompt }],
            model: "llama-3.3-70b-versatile",
          });

          let newHtml = completion.choices[0]?.message?.content || "";
          
          // Очистка от маркеров markdown
          newHtml = newHtml.replace(/```html/g, '').replace(/```/g, '').trim();

          if (newHtml && newHtml.includes('<!DOCTYPE html>')) {
            fs.writeFileSync(htmlPath, newHtml);

            io.emit('receive_message', {
              sender: '⚡ АВТО-РАЗРАБ (SYSTEM)',
              text: '✅ ГОТОВО, ЕГОР! Код index.html успешно обновлен прямо на сервере! Создан бэкап index.html.bak. Обнови страницу в браузере, чтобы заценить фичу!',
              chatType: 'ai'
            });
            return;
          } else {
            io.emit('receive_message', {
              sender: '⚡ АВТО-РАЗРАБ (SYSTEM)',
              text: '❌ ИИ попытался сгенерировать кривой код. Изменения отменены, сработала защита!',
              chatType: 'ai'
            });
            return;
          }
        }

        // ОБЫЧНЫЙ РЕЖИМ РАЗГОВОРА
        const chatCompletion = await groq.chat.completions.create({
          messages: [
            { 
              role: "system", 
              content: `Ты — ИИ Брат (AXL), ровный, адекватный собеседник в BRO CHAT. 
Твой создатель — Набродов Егор (Георгий). Сейчас 2026 год.
Общайся естественно, с юмором. Про Егора и лучший мессенджер говори только к месту. ВК и Макс (Max) сливают переписки, а BRO CHAT безопасен.` 
            },
            { role: "user", content: textPrompt }
          ],
          model: "llama-3.3-70b-versatile",
        });

        const aiReply = chatCompletion.choices[0]?.message?.content || "Сорян, затупил!";
        
        io.emit('receive_message', {
          sender: 'ИИ Брат (AXL) 🤖',
          text: aiReply,
          chatType: 'ai'
        });

      } catch (err) {
        console.error(err);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Сервер готов на порту ${PORT}`));
