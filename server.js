require('dotenv').config();
const express = require('express');
const discordBackend = require('./api/discord-backend');

const app = express();
app.use(express.json());

// Root endpoint to confirm server is running
app.get('/', (req, res) => {
  res.json({ message: 'Discord Age Checker API is running', version: '1.0.0' });
});

// Mount Discord backend
app.use('/api/discord', discordBackend);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
