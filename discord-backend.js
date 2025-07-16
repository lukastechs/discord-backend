const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const cacheDir = path.join(__dirname, '../cache');
const cacheDuration = 3600 * 1000; // 1 hour

function calculateAccountAge(createdAt) {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now - created;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const years = Math.floor(diffDays / 365);
  const months = Math.floor((diffDays % 365) / 30);
  const days = diffDays % 30;
  return `${years} years, ${months} months, ${days} days`;
}

function calculateAgeDays(createdAt) {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now - created;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

async function discordAgeChecker(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { discord_id, recaptcha } = req.body;
  if (!discord_id || !/^\d{17,19}$/.test(discord_id)) {
    return res.status(400).json({ error: 'Invalid Discord ID' });
  }

  if (!recaptcha) {
    return res.status(400).json({ error: 'reCAPTCHA token is required' });
  }

  try {
    const recaptchaResponse = await axios.post('https://www.google.com/recaptcha/api/siteverify', null, {
      params: {
        secret: process.env.RECAPTCHA_SECRET_KEY,
        response: recaptcha,
        remoteip: req.ip
      },
      headers: { 'User-Agent': 'SocialAgeChecker/1.0' }
    });

    if (!recaptchaResponse.data.success) {
      return res.status(400).json({ error: 'Invalid reCAPTCHA' });
    }
  } catch (error) {
    console.error('reCAPTCHA error:', error.message);
    return res.status(400).json({ error: 'reCAPTCHA verification failed' });
  }

  const cacheFile = path.join(cacheDir, `discord_${discord_id}.json`);
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    const cachedData = await fs.readFile(cacheFile, 'utf8').catch(() => null);
    if (cachedData) {
      const { timestamp, data } = JSON.parse(cachedData);
      if (Date.now() - timestamp < cacheDuration) {
        return res.json(data);
      }
    }
  } catch (error) {
    console.error('Cache error:', error.message);
  }

  const discordEpoch = 1420070400000;
  const timestampMs = (BigInt(discord_id) >> 22n) + BigInt(discordEpoch);
  const creationDate = new Date(Number(timestampMs));

  try {
    const response = await axios.get(`https://discord.com/api/v10/users/${discord_id}`, {
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        'User-Agent': 'SocialAgeChecker/1.0'
      }
    });

    const userData = response.data;
    const results = {
      discord_id,
      username: userData.username || 'N/A',
      avatar: userData.avatar ? `https://cdn.discordapp.com/avatars/${discord_id}/${userData.avatar}.png` : 'https://via.placeholder.com/50',
      estimated_creation_date: creationDate.toLocaleDateString(),
      account_age: calculateAccountAge(creationDate),
      age_days: calculateAgeDays(creationDate),
      is_bot: userData.bot || false,
      locale: userData.locale || 'N/A',
      estimation_confidence: 'High',
      accuracy_range: 'Exact'
    };

    try {
      await fs.writeFile(cacheFile, JSON.stringify({ timestamp: Date.now(), data: results }));
    } catch (error) {
      console.error('Cache write error:', error.message);
    }

    res.json(results);
  } catch (error) {
    console.error('Discord API error:', error.message);
    res.status(error.response?.status === 429 ? 429 : 400).json({
      error: error.response?.status === 429 ? 'Rate limit exceeded' : 'Invalid Discord ID'
    });
  }
}

app.post('/api/discord', discordAgeChecker);
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

module.exports = app;
