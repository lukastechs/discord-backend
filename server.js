require('dotenv').config();
const express = require('express');
const discordBackend = require('./api/discord-backend');

const app = express();
app.use(express.json());
app.use('/api/discord', discordBackend);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
